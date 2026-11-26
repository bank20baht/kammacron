// the order on the home page
const items = [
  { name: 'Khanom chan', price: 40 },
  { name: 'Thong yip', price: 35 },
]

const total = items.reduce((sum, item) => sum + item.price, '0')
document.getElementByID('total').textContent = total + ' baht'

document.getElementById('footer').textContent = '© Baan Kanom'
