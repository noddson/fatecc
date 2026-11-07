/** Resume a surviving session after browser suspension or network restoration. */
export function observeResume(resume: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const visible = () => {
    if (document.visibilityState === 'visible') resume();
  };
  window.addEventListener('online', resume);
  window.addEventListener('pageshow', visible);
  document.addEventListener('visibilitychange', visible);
  document.addEventListener('resume', resume);
  return () => {
    window.removeEventListener('online', resume);
    window.removeEventListener('pageshow', visible);
    document.removeEventListener('visibilitychange', visible);
    document.removeEventListener('resume', resume);
  };
}
