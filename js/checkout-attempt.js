// Persist only an identifier and digest, never the checkout's address or phone.
export function createCheckoutAttemptStore({ storage = () => window.sessionStorage, createId, digest = async text => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
} }) {
  const memory = new Map();
  const key = owner => `ssupertea-checkout-attempt-v1:${owner}`;
  function read(owner) {
    if (memory.has(owner)) return memory.get(owner);
    try { const saved = JSON.parse(storage().getItem(key(owner)) || "null"); if (saved?.id && saved?.digest) return saved; } catch {}
    return memory.get(owner);
  }
  return {
    async idFor(payload, owner) {
      if (!owner) throw new Error("Sign in before placing this order.");
      const { id: _id, ...choices } = payload;
      const signature = await digest(JSON.stringify(choices));
      let attempt = read(owner);
      if (!attempt || attempt.digest !== signature) attempt = { id: createId(), digest: signature };
      memory.set(owner, attempt);
      try { storage().setItem(key(owner), JSON.stringify(attempt)); } catch {}
      return attempt.id;
    },
    clear(owner, id) {
      if (read(owner)?.id !== id) return;
      memory.set(owner, null);
      try { storage().removeItem(key(owner)); } catch {}
    },
  };
}
