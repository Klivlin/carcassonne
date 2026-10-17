// Сетевая игра через публичный MQTT-брокер (WebSocket) — работает с любого хостинга и за любым NAT.
// Хоста нет: состояние партии лежит на брокере (retained-сообщение), и каждый игрок,
// сделав ход, публикует новое состояние. Кто бы ни вышел, остальные могут продолжать.
const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const ROOT = 'carcassonne-ru/v2/';
const HEARTBEAT = 8000;
export const TIMEOUT = 25000;

export function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

const encode = msg => JSON.stringify(msg);
const decode = buf => { try { return JSON.parse(buf.toString()); } catch { return null; } };

// Подключение к комнате. Обработчики:
//   onLobby(lobby)    — состав комнаты и режимы до начала партии;
//   onState(state)    — новое состояние партии;
//   onPing(key, name) — игрок в сети;
//   onChat(msg), onLive(msg), onStatus(text), onReady().
export function room(code, key, name, h) {
  const base = ROOT + code;
  const client = mqtt.connect(BROKER, { reconnectPeriod: 2000, connectTimeout: 10000, keepalive: 30 });
  const ping = () => client.connected && client.publish(base + '/ping', encode({ key, name }), { qos: 0 });
  h.onStatus('Подключение…');
  client.on('connect', () => {
    client.subscribe([base + '/lobby', base + '/state', base + '/ping', base + '/chat', base + '/chatlog', base + '/live'], { qos: 1 }, () => {
      h.onStatus('');
      ping();
      h.onReady();
    });
  });
  client.on('reconnect', () => h.onStatus('Переподключение…'));
  client.on('offline', () => h.onStatus('Нет связи с сервером…'));
  client.on('message', (topic, buf) => {
    const msg = decode(buf);
    if (!msg) return;
    const t = topic.slice(base.length + 1);
    // Ошибка в обработке одного сообщения не должна рвать соединение.
    try {
      if (t === 'lobby') h.onLobby(msg);
      else if (t === 'state') h.onState(msg);
      else if (t === 'ping') h.onPing(msg.key, msg.name);
      else if (t === 'chat') h.onChat(msg);
      else if (t === 'chatlog') for (const m of msg) h.onChat(m);
      else if (t === 'live' && msg.key !== key) h.onLive(msg);
    } catch (e) { console.error(e); }
  });
  const timer = setInterval(ping, HEARTBEAT);
  return {
    lobby(l) { client.publish(base + '/lobby', encode(l), { qos: 1, retain: true }); },
    state(s) { client.publish(base + '/state', encode(s), { qos: 1, retain: true }); },
    // Сообщение и последние 30 сообщений (retained) — чтобы вернувшиеся видели историю.
    chat(m, recent) {
      client.publish(base + '/chat', encode(m), { qos: 1 });
      client.publish(base + '/chatlog', encode(recent), { qos: 1, retain: true });
    },
    live(m) { client.publish(base + '/live', encode({ ...m, key }), { qos: 0 }); },
    ping,
    destroy() { clearInterval(timer); client.end(true); },
  };
}
