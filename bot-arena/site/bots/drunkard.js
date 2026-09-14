// Drunkard: picks random tiles and random directions, and spends every order it can.
function bot(s) {
  const mine = [];
  for (let i = 0; i < s.owner.length; i++) {
    if (s.owner[i] === s.me && s.mass[i] > 1) mine.push(i);
  }
  const orders = [];
  for (let k = 0; k < s.maxOrders && mine.length > 0; k++) {
    const from = mine[Math.floor(Math.random() * mine.length)];
    orders.push({ from, dir: Math.floor(Math.random() * 4), all: Math.random() < 0.3 });
  }
  return orders;
}
