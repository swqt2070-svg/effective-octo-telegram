export function getLocal(k){ try { return localStorage.getItem(k) } catch { return null } }
export function setLocal(k,v){ try { localStorage.setItem(k,v) } catch {} }
export function delLocal(k){ try { localStorage.removeItem(k) } catch {} }
