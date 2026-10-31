/** Authenticated bounded SSE subscription; reconnects without exposing its token to the browser. */
export function connectEvents({ origin, token, onEvent, onState = () => {}, fetcher = fetch, maxBackoffMs = 30_000, idleMs = 35_000 }) {
  let stopped = false, abort, attempt = 0, idle, delayTimer, releaseDelay;
  const state = (value) => { try { onState(value); } catch { /* caller faults stay contained */ } };
  function arm(ms) { clearTimeout(idle); idle = setTimeout(() => abort?.abort(), ms); idle.unref?.(); }
  const run = async () => {
    while (!stopped) {
      abort = new AbortController(); let reader;
      try {
        arm(10000);
        const response = await fetcher(origin + '/api/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          redirect: 'error', signal: abort.signal,
        });
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
          await response.body?.cancel();
          if (response.status === 401) { state('unauthorized'); return; }
          throw new Error('invalid event response');
        }
        if (stopped) { await response.body?.cancel(); break; }
        state('open');
        reader = response.body.getReader();
        const decoder = new TextDecoder(); let buffer = '', connected = false;
        arm(idleMs);
        for (;;) {
          const { value, done } = await reader.read();
          if (done || stopped) break;
          arm(idleMs);
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          if (buffer.length > 2_000_000) throw new Error('event frame too large');
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0,index); buffer = buffer.slice(index + 2);
            let event = 'message'; const data = [];
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            }
            if (!data.length) continue;
            let parsed; try { parsed = JSON.parse(data.join('\n')); } catch { continue; }
            if (!connected) { attempt = 0; connected = true; }
            try { onEvent(event, parsed); } catch { /* no script from the service is executed */ }
          }
        }
      } catch { /* bounded retry below */ }
      finally {
        clearTimeout(idle);
        await reader?.cancel().catch(() => {});
        reader?.releaseLock(); abort.abort();
      }
      if (stopped) break;
      state('closed');
      const ms = Math.min(maxBackoffMs, 1000 * 2 ** Math.min(attempt++, 5));
      await new Promise((resolve) => { releaseDelay = resolve; delayTimer = setTimeout(resolve, ms); delayTimer.unref?.(); });
      releaseDelay = null;
    }
  };
  const finished = run();
  return {
    close() { stopped = true; clearTimeout(idle); clearTimeout(delayTimer); releaseDelay?.(); abort?.abort(); },
    finished,
  };
}
