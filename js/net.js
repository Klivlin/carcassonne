// Сетевая игра через публичные MQTT-брокеры (WebSocket) — работает с любого хостинга и за любым NAT.
// Хоста нет: состояние партии лежит на брокере (retained-сообщение), и каждый игрок,
// сделав ход, публикует новое состояние. Кто бы ни вышел, остальные могут продолжать.
//
// Подключаемся сразу к нескольким брокерам на разных хостингах и шлём всё во все: если у игрока
// провайдер «замораживает» соединение с одним из них, сообщения дойдут через другой.
// Дубли отсеивает main.js.
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',      // AWS
  'wss://broker.hivemq.com:8884/mqtt',   // AWS Франкфурт
  'wss://test.mosquitto.org:8081',       // OVH Франция
];
const ROOT = 'carcassonne-ru/v2/';
const HEARTBEAT = 2000;
// Своё эхо не вернулось за это время — соединение «замёрзло» (вкладка спала, сеть сменилась,
// провайдер притормозил). Переподключаемся, не дожидаясь, пока это заметит браузер.
const STALE = 5000;
export const TIMEOUT = 15000;

export function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
}

const encode = msg => JSON.stringify(msg);
const decode = buf => { try { return JSON.parse(buf.toString()); } catch { return null; } };
const TOPICS = ['lobby', 'state', 'ping', 'chat', 'chatlog', 'live'];

// Подключение к комнате. Обработчики:
//   onLobby(lobby)    — состав комнаты и режимы до начала партии;
//   onState(state)    — новое состояние партии;
//   onPing(key, name) — игрок в сети;
//   onChat(msg), onLive(msg), onStatus(text), onReady().
export function room(code, key, name, h) {
  const base = ROOT + code;
  let closed = false;
  // В пинге — какие брокеры у этого игрока сейчас живы (e/h/m), для диагностики.
  const pingMsg = () => encode({ key, name, ok: links.map(l => (l.healthy() ? l.tag : '-')).join('') });

  let links = [];
  links = BROKERS.map(url => {
    // reschedulePings: false — PINGREQ уходит по расписанию, даже если мы сами что-то шлём.
    // queueQoSZero: false — не копить «живые» сообщения, пока связи нет: они устаревают.
    const client = mqtt.connect(url, {
      reconnectPeriod: 1000, connectTimeout: 6000, keepalive: 10, reschedulePings: false, queueQoSZero: false,
    });
    const link = { url, client, tag: url.split('//')[1].split('.')[1][0], lastEcho: Date.now(), ready: false };
    link.healthy = () => link.ready && client.connected && Date.now() - link.lastEcho < STALE;
    link.ping = () => client.connected && client.publish(base + '/ping', pingMsg(), { qos: 0 });
    link.revive = () => {
      if (closed) return;
      link.ready = false;
      link.lastEcho = Date.now();
      client.end(true, {}, () => { if (!closed) client.reconnect(); });
    };
    client.on('connect', () => {
      link.lastEcho = Date.now();
      client.subscribe(TOPICS.map(t => base + '/' + t), { qos: 1 }, () => {
        link.ready = true;
        link.ping();
        status();
        h.onReady();
      });
    });
    client.on('close', () => { link.ready = false; status(); });
    client.on('error', () => {});
    client.on('message', (topic, buf) => {
      const msg = decode(buf);
      if (!msg) return;
      const t = topic.slice(base.length + 1);
      // Ошибка в обработке одного сообщения не должна рвать соединение.
      try {
        if (t === 'ping') {
          if (msg.key === key) link.lastEcho = Date.now();
          h.onPing(msg.key, msg.name);
        } else if (t === 'lobby') h.onLobby(msg);
        else if (t === 'state') h.onState(msg);
        else if (t === 'chat') h.onChat(msg);
        else if (t === 'chatlog') for (const m of msg) h.onChat(m);
        else if (t === 'live' && msg.key !== key) h.onLive(msg);
      } catch (e) { console.error(e); }
    });
    return link;
  });

  let lastStatus = null;
  function status() {
    const ok = links.some(l => l.healthy());
    const any = links.some(l => l.ready);
    const text = ok ? '' : any ? 'Связь пропала — переподключаюсь…' : 'Подключение…';
    if (text !== lastStatus) { lastStatus = text; h.onStatus(text); }
  }

  const check = () => {
    if (closed) return;
    for (const l of links) {
      if (!l.client.connected) { if (!l.client.reconnecting) l.client.reconnect(); continue; }
      if (l.ready && Date.now() - l.lastEcho > STALE) l.revive();
      else l.ping();
    }
    status();
  };
  const timer = setInterval(check, HEARTBEAT);
  // Вернулись на вкладку / разблокировали телефон / появилась сеть — проверяем связь сразу.
  const wake = () => { if (!document.hidden) check(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);

  const publish = (t, msg, opts) => {
    const payload = encode(msg);
    for (const l of links) {
      // QoS 1 копится и уйдёт после переподключения; QoS 0 шлём только в живые соединения.
      if (opts.qos === 1 || l.client.connected) l.client.publish(base + '/' + t, payload, opts);
    }
  };

  return {
    lobby(l) { publish('lobby', l, { qos: 1, retain: true }); },
    state(s) { publish('state', s, { qos: 1, retain: true }); },
    // Сообщение и последние сообщения (retained) — чтобы вернувшиеся видели историю.
    chat(m, recent) {
      publish('chat', m, { qos: 1 });
      publish('chatlog', recent, { qos: 1, retain: true });
    },
    // Retained: переподключившийся сразу видит, что сейчас примеряет игрок.
    live(m) { publish('live', { ...m, key }, { qos: 0, retain: true }); },
    connected: () => links.some(l => l.healthy()),
    links,
    ping: () => links.forEach(l => l.ping()),
    destroy() {
      closed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      for (const l of links) l.client.end(true);
    },
  };
}
