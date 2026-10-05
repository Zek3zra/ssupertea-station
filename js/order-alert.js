// Browser audio must be enabled by a staff member's tap. No audio files are needed.
export function createOrderAlert({ button, status, environment = window }) {
  const REPEAT_MS = 4_000;
  let context = null;
  let timer = null;
  let pendingCount = 0;
  let enabling = false;
  let destroyed = false;
  let audioError = "";
  const voices = new Set();

  function stop() {
    if (timer !== null) environment.clearInterval(timer);
    timer = null;
    for (const voice of voices) {
      try { voice.stop(); } catch { /* Already stopped. */ }
    }
    voices.clear();
  }

  function render() {
    const enabled = context?.state === "running";
    if (button) {
      button.textContent = enabling ? "Enabling sound…" : enabled ? "Test order sound" : "Enable order sound";
      button.disabled = enabling;
    }
    if (status) {
      const queue = pendingCount ? `${pendingCount} ${pendingCount === 1 ? "order needs" : "orders need"} confirmation.` : "No orders waiting.";
      const message = `${queue} ${audioError || (enabled ? "Sound on until orders are handled." : "Tap Enable order sound to hear alerts.")}`;
      if (status.textContent !== message) status.textContent = message;
    }
  }

  function play() {
    if (destroyed || context?.state !== "running") { render(); return; }
    try {
      // A short two-tone chime, repeated while the pending queue is nonempty.
      [660, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        const at = context.currentTime + index * .22;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0, at);
        volume.gain.linearRampToValueAtTime(.18, at + .025);
        volume.gain.exponentialRampToValueAtTime(.001, at + .18);
        oscillator.connect(volume);
        volume.connect(context.destination);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); volume.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + .2);
      });
    } catch {
      audioError = "Sound could not play. Tap Enable order sound to retry.";
      stop();
      if (context) { context.onstatechange = null; context.close().catch(() => {}); }
      context = null;
      render();
    }
  }

  function reconcile() {
    if (destroyed) return;
    if (!pendingCount || context?.state !== "running") stop();
    else if (timer === null) {
      // Set the timer first so an audio failure can cancel it too.
      timer = environment.setInterval(() => {
        if (!pendingCount || context?.state !== "running") reconcile();
        else play();
      }, REPEAT_MS);
      play();
    }
    render();
  }

  async function enable() {
    if (enabling || destroyed) return;
    enabling = true;
    const wasAlerting = timer !== null;
    audioError = "";
    render();
    try {
      const AudioContext = environment.AudioContext || environment.webkitAudioContext;
      if (!AudioContext) throw new Error("Audio unavailable");
      if (!context || context.state === "closed") {
        context = new AudioContext();
        context.onstatechange = reconcile;
      }
      await context.resume();
      if (destroyed) return;
      reconcile();
      if (!pendingCount || wasAlerting) play();
    } catch {
      audioError = "Sound is unavailable. Check browser sound permissions and try again.";
    } finally {
      enabling = false;
      if (!destroyed) render();
    }
  }

  button?.addEventListener("click", enable);
  render();
  return {
    setPending(orders) {
      pendingCount = orders.filter(order => order.status === "pending").length;
      reconcile();
    },
    destroy() {
      destroyed = true;
      stop();
      button?.removeEventListener("click", enable);
      if (context) { context.onstatechange = null; context.close().catch(() => {}); }
    },
  };
}
