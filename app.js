let plants = JSON.parse(localStorage.getItem('plants') || '[]')

function save() {
  localStorage.setItem('plants', JSON.stringify(plants))
  render()
}

function addPlant(name) {
  plants.push({
    id: Date.now(),
    name,
    history: []
  })
  save()
}

function render() {
  const container = document.getElementById('plants-list')
  container.innerHTML = ''

  plants.forEach(p => {
    container.innerHTML += `<div>${p.name}</div>`
  })
}

render()
