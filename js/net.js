// Сетевая игра через публичный MQTT-брокер (WebSocket) — работает с любого хостинга
// и за любым NAT. Хост хранит состояние и рассылает его всем; гости шлют ему ходы.
const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const ROOT = 'carcassonne-ru/v1/';
const HEARTBEAT = 8000;
const TIMEOUT = 25000;

export function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

const encode = msg => JSON.stringify(msg);
const decode = buf => { try { return JSON.parse(buf.toString()); } catch { return null; } };
const connect = () => mqtt.connect(BROKER, { reconnectPeriod: 2000, connectTimeout: 10000, keepalive: 30 });

// Хост: onMessage(key, msg) вызывается на каждое сообщение от гостя.
export function host(code, { onReady, onMessage, onLeave, onError, onLive }) {
  const base = ROOT + code;
  const client = connect();
  const seen = new Map(); // key -> время последнего сообщения
  let last = null;
  client.on('connect', () => {
    client.subscribe([base + '/up', base + '/live'], { qos: 1 }, err => err ? onError(err) : onReady());
  });
  client.on('error', e => onError(e));
  client.on('message', (topic, buf) => {
    const msg = decode(buf);
    if (!msg || !msg.key) return;
    if (topic.endsWith('/live')) return onLive(msg);
    const fresh = !seen.has(msg.key);
    seen.set(msg.key, Date.now());
    if (msg.type === 'ping') { if (fresh) onMessage(msg.key, { type: 'hello', name: msg.name }); return; }
    onMessage(msg.key, msg);
  });
  const timer = setInterval(() => {
    let left = false;
    for (const [k, t] of seen) if (Date.now() - t > TIMEOUT) { seen.delete(k); left = true; }
    if (left) onLeave();
    else if (last) client.publish(base + '/down', encode({ ...last, t: Date.now() }), { qos: 1, retain: true });
  }, HEARTBEAT);
  return {
    send(k, msg) { client.publish(base + '/to/' + k, encode(msg), { qos: 1 }); },
    broadcast(msg) { last = msg; client.publish(base + '/down', encode({ ...msg, t: Date.now() }), { qos: 1, retain: true }); },
    live(msg) { client.publish(base + '/live', encode(msg), { qos: 0 }); },
    online: () => new Set(seen.keys()),
    destroy() { clearInterval(timer); client.end(true); },
  };
}

// Гость: подписывается на состояние комнаты и шлёт хосту ходы.
export function join(code, key, name, { onMessage, onStatus, onLive }) {
  const base = ROOT + code;
  const client = connect();
  let lastSync = 0;
  const ping = () => client.connected && client.publish(base + '/up', encode({ type: 'ping', key, name }), { qos: 1 });
  onStatus('Подключение…');
  client.on('connect', () => {
    client.subscribe([base + '/down', base + '/to/' + key, base + '/live'], { qos: 1 });
    client.publish(base + '/up', encode({ type: 'hello', key, name }), { qos: 1 });
    onStatus(lastSync ? '' : 'Ждём ответа от хоста…');
  });
  client.on('reconnect', () => onStatus('Переподключение…'));
  client.on('message', (topic, buf) => {
    const msg = decode(buf);
    if (!msg) return;
    if (topic.endsWith('/live')) return onLive(msg);
    if (msg.type === 'sync') { if (!lastSync) onStatus(''); lastSync = Date.now(); }
    onMessage(msg);
  });
  const timer = setInterval(() => {
    ping();
    if (client.connected) onStatus(Date.now() - lastSync > TIMEOUT ? 'Хост сейчас не в сети — ждём его…' : '');
  }, HEARTBEAT);
  return {
    send(msg) { client.publish(base + '/up', encode({ ...msg, key }), { qos: 1 }); },
    live(msg) { client.publish(base + '/live', encode({ ...msg, key }), { qos: 0 }); },
    destroy() { clearInterval(timer); client.end(true); },
  };
}
