const dedupe = (): void => {
  const seen = new Set<string>()
  const elements = document.querySelectorAll('[data-id]')

  elements.forEach((item) => {
    const id = item.getAttribute('data-id')
    if (!id) {
      return
    }
    if (seen.has(id)) {
      item.remove()
    } else {
      seen.add(id)
    }
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dedupe)
  } else {
    dedupe()
  }

  window.addEventListener('load', dedupe)
window.addEventListener('load', dedupe)
