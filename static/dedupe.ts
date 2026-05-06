const dedupe = (): void => {
  const seen = new Set<string>()
  const elements = document.querySelectorAll('[data-id]')
  elements.forEach((item) => {
    const id = item.getAttribute('data-id')
    if (id && seen.has(id)) {
      item.remove()
    } else if (id) {
      seen.add(id)
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dedupe)
} else {
  dedupe()
}
// Also run on window load to be sure
window.addEventListener('load', dedupe)
