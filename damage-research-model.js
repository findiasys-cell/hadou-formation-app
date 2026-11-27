'use strict';

const BRANCHES = ['足軽', '長槍', '騎馬', '母衣', '弓', '強弓', '鉄砲', '剣豪', '忍者'];
const STRUCTURE = '物体（里・城）';
const HIT_TYPES = {
  '通常攻撃': ['attack', 'defense'],
  '武勇戦法': ['attackStrength', 'defenseStrength'],
  '知略戦法': ['attackIntelligence', 'defenseIntelligence'],
  '対物通常攻撃': ['demolition', 'defense'],
  '対物破壊戦法': ['demolition', 'defense']
};
const COMBAT_STATS = [...new Set(Object.values(HIT_TYPES).flat())];

const FIELD_GROUPS = {
  hit: [
    {id:'damage', label:'実測ダメージ', integer:true, required:true},
    {id:'kind', label:'攻撃種別', options:Object.keys(HIT_TYPES), required:true},
    {id:'critical', label:'会心', options:['なし', 'あり'], empty:'不明'},
    {id:'power', label:'戦法威力（％）'},
    {id:'affinity', label:'兵科相性（攻撃側）', options:['有利','補正なし','不利']}
  ],
  attack: [
    {id:'attackBranch', label:'攻撃側の兵科', options:BRANCHES},
    {id:'attack', label:'攻撃'},
    {id:'attackStrength', label:'攻撃側の武勇'},
    {id:'attackIntelligence', label:'攻撃側の知略'},
    {id:'demolition', label:'破壊'},
    {id:'attackTroops', label:'攻撃側の現在兵力', integer:true}
  ],
  defense: [
    {id:'defenseBranch', label:'防御側の兵科・対象', options:[...BRANCHES, STRUCTURE]},
    {id:'defense', label:'防御'},
    {id:'defenseStrength', label:'防御側の武勇'},
    {id:'defenseIntelligence', label:'防御側の知略'},
    {id:'defenseTroops', label:'防御側の現在兵力', integer:true}
  ]
};
const FIELDS = Object.values(FIELD_GROUPS).flat();
const MAX_NUMBER = 999999999;
const MAX_RECORDS = 500;
const MAX_PARAMS = 30;
const BUILT_IN_NAMES = new Map(FIELDS.map(field => [field.id, field.label]));
const collator = new Intl.Collator('ja', {numeric:true});

function readRecord(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('実測の形式が正しくありません。');
  const record = {};
  for (const field of FIELDS) {
    const value = raw[field.id] ?? null;
    const valid = field.options
      ? field.options.includes(value)
      : Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER && (!field.integer || Number.isInteger(value));
    if (!valid && (value !== null || field.required)) throw new Error(`${field.label}の入力値を確認してください。`);
    record[field.id] = value;
  }
  if (record.defenseBranch && (record.defenseBranch === STRUCTURE) !== record.kind.startsWith('対物')) {
    throw new Error('攻撃種別と防御側の対象をそろえてください。');
  }
  if (record.kind.startsWith('対物')) record.affinity = null;
  const params = raw.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new Error('パラメータの形式が正しくありません。');
  const entries = Object.entries(params);
  if (entries.length > MAX_PARAMS) throw new Error(`パラメータは1件につき${MAX_PARAMS}項目までです。`);
  for (const [key, value] of entries) {
    if (!key.trim() || key.length > 70 || /[=＝\r\n]/.test(key) ||
        typeof value !== 'string' || !value.trim() || value.length > 100 || /[\r\n]/.test(value)) {
      throw new Error('パラメータの項目名と値を確認してください。');
    }
  }
  record.params = Object.fromEntries(entries);
  record.note = typeof raw.note === 'string' ? raw.note.slice(0,240) : '';
  return record;
}

function parseParameters(text) {
  const entries = new Map();
  for (const original of text.split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    const match = /^([^=＝]+)[=＝](.+)$/.exec(line);
    if (!match) throw new Error('パラメータは「項目名=値」の形式で入力してください。');
    const key = match[1].trim();
    if (entries.has(key)) throw new Error(`同じ項目名が複数あります（${key}）。`);
    const value = match[2].trim();
    const normalized = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) && Number.isFinite(Number(value))
      ? String(Number(value)) : value;
    entries.set(key, normalized);
  }
  return Object.fromEntries(entries);
}

function conditions(record, ignored) {
  return [
    ...FIELDS.filter(({id}) => id !== 'damage' && !ignored.has(id)).map(({id}) => [id, record[id]]),
    ...Object.entries(record.params)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => ['param:' + key, value]).filter(([key]) => !ignored.has(key))
  ];
}

function analysisConditions(record, ...ignored) {
  const used = HIT_TYPES[record.kind];
  const omitted = COMBAT_STATS.filter(id => !used.includes(id));
  if (!record.kind.endsWith('戦法')) omitted.push('power');
  return conditions(record, new Set([...omitted, ...ignored]));
}

function describeParameter(key) {
  return BUILT_IN_NAMES.get(key) ?? key.slice('param:'.length);
}

function compareParameter(records, field) {
  const matched = new Map();
  for (const record of records) {
    const name = field.slice(6);
    const value = field.startsWith('param:')
      ? Object.hasOwn(record.params,name) ? record.params[name] : null
      : record[field];
    if (value === null || value === undefined) continue;
    const context = JSON.stringify(field === 'kind'
      ? conditions(record, new Set([field]))
      : analysisConditions(record, field));
    if (!matched.has(context)) matched.set(context, new Map());
    const levels = matched.get(context);
    if (!levels.has(value)) levels.set(value, {count:0, sum:0});
    const level = levels.get(value);
    level.count++;
    level.sum += record.damage;
  }
  const contrasts = new Map();
  for (const levels of matched.values()) {
    const values = [...levels.keys()].sort((a,b) => {
      if (field === 'critical') return a === b ? 0 : a === 'なし' ? -1 : 1;
      if (Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Number(a)-Number(b);
      return collator.compare(a,b) || (a < b ? -1 : 1);
    });
    for (const [index, low] of values.entries()) {
      const a = levels.get(low);
      const aMean = a.sum / a.count;
      for (const high of values.slice(index+1)) {
        const b = levels.get(high);
        const diff = b.sum / b.count - aMean;
        const pair = JSON.stringify([low, high]);
        if (!contrasts.has(pair)) contrasts.set(pair, {low, high, count:0, a:0, b:0, diff:0, ratio:0, ratioCount:0});
        const result = contrasts.get(pair);
        result.count++;
        result.a += a.count;
        result.b += b.count;
        result.diff += diff;
        if (aMean > 0) {
          result.ratio += 100 * diff / aMean;
          result.ratioCount++;
        }
      }
    }
  }
  return [...contrasts.values()].sort((a,b) => b.count-a.count || (b.a+b.b)-(a.a+a.b)).map(result => ({
    ...result, diff:result.diff/result.count, ratio:result.ratioCount ? result.ratio/result.ratioCount : null
  }));
}

function fitGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const [offense, resistance] = HIT_TYPES[record.kind];
    const x = record[offense], z = record[resistance];
    if (x === null) continue;
    const hasResistance = z !== null;
    const context = analysisConditions(record, offense, resistance);
    const key = JSON.stringify([hasResistance, context]);
    if (!groups.has(key)) groups.set(key, {key, context, offense, resistance, hasResistance, samples:[]});
    groups.get(key).samples.push({x, z, damage:record.damage});
  }
  return [...groups.values()].sort((a,b) => b.samples.length-a.samples.length);
}

function normalizedDamageBase(attack, resistance) {
  return attack + resistance > 0 ? 2 * attack * attack / (attack + resistance) : 0;
}

function resistanceContext(record) {
  return JSON.stringify(analysisConditions(record, ...HIT_TYPES[record.kind]));
}

function resistanceCalibration(records) {
  const groups = new Map();
  for (const record of records) {
    const [offense, resistance] = HIT_TYPES[record.kind];
    if (record[offense] === null || record[resistance] === null ||
        record[offense] <= 0 || record.damage <= 0) continue;
    const base = normalizedDamageBase(record[offense], record[resistance]);
    if (base <= 0 || !Number.isFinite(base)) continue;
    const key = resistanceContext(record);
    const group = groups.get(key) ?? {count:0, xx:0, xy:0};
    group.count++;
    group.xx += base * base;
    group.xy += base * record.damage;
    groups.set(key, group);
  }
  return groups;
}

function estimateResistance(record, calibration, settings) {
  const [offense, field] = HIT_TYPES[record.kind];
  if (record[field] !== null) return null;
  const label = describeParameter(field);
  const attack = record[offense];
  if (!(attack > 0) || !(record.damage > 0)) {
    return {label, error:`${describeParameter(offense)}と実測ダメージには、0より大きい値が必要です。`};
  }

  const matching = calibration.get(resistanceContext(record));
  let scale;
  let basis;
  if (matching && matching.xx > 0) {
    scale = matching.xy / matching.xx;
    basis = `同条件の入力済みデータ ${matching.count}件で係数を調整`;
  } else {
    const tactic = record.kind.endsWith('戦法');
    const power = tactic ? (record.power ?? 100) : 100;
    const critical = record.critical === 'あり' ? settings.critical : 100;
    if (record.critical === 'あり' && !(critical > 0)) {
      return {label, error:'会心時の倍率を入力すると試算できます。'};
    }
    if (!(settings.base > 0) || !(power > 0)) {
      return {label, error:'基準倍率と、戦法の場合は戦法威力に0より大きい値が必要です。'};
    }
    const affinity = record.affinity === '有利' ? settings.advantage
      : record.affinity === '不利' ? settings.disadvantage : 100;
    if (!(affinity > 0)) return {label, error:'選択した兵科相性の倍率に、0より大きい値が必要です。'};
    scale = (settings.base / 100) * (power / 100) * (critical / 100) * (affinity / 100);
    const assumptions = ['仮の式'];
    if (!record.kind.startsWith('対物')) {
      assumptions.push(record.affinity ? `兵科相性 ${record.affinity} ${affinity}%` : '兵科相性不明を100%と仮定');
    }
    if (tactic && record.power === null) assumptions.push('戦法威力100%と仮定');
    if (record.critical === null) assumptions.push('会心不明を通常相当と仮定');
    basis = assumptions.join('・');
  }

  const value = (2 * scale * attack * attack) / record.damage - attack;
  if (!Number.isFinite(value) || value > MAX_NUMBER) {
    return {label, error:'この条件での逆算値は入力可能な範囲を超えています。'};
  }
  if (value < 0) {
    return {label, error:'実測ダメージが、この式で防御側の能力値を0とした場合の上限を超えています。'};
  }
  return {label, value, scale, basis};
}

const MODELS = [
  {name:'k × 攻側能力', offenseOnly:true, predict:x => x},
  {name:'k × 攻側能力 ÷ 防側能力', predict:(x,z) => z > 0 ? x/z : null},
  {name:'k × 2 × 攻側能力² ÷（攻側能力 + 防側能力）', predict:normalizedDamageBase},
  {name:'k × max（攻側能力 − 防側能力, 0）', predict:(x,z) => Math.max(0,x-z)}
];

function fitModels(samples) {
  if (samples.length < 4 || new Set(samples.map(({x,z}) => x + '/' + z)).size < 2) return [];
  const hasResistance = samples.every(({z}) => z !== null);
  return MODELS.flatMap(model => {
    if (!hasResistance && !model.offenseOnly) return [];
    const values = samples.map(({x,z,damage}) => ({f:model.predict(x,z), damage}));
    if (values.some(({f}) => f === null)) return [];
    const xx = values.reduce((sum,{f}) => sum+f*f,0);
    const xy = values.reduce((sum,{f,damage}) => sum+f*damage,0);
    if (xx <= 0 || values.some(({f}) => xx-f*f <= xx*1e-12)) return [];
    const error = values.reduce((sum,{f,damage}) => sum+Math.abs(f*(xy-f*damage)/(xx-f*f)-damage),0);
    return [{name:model.name,k:xy/xx,mae:error/samples.length}];
  }).sort((a,b) => a.mae-b.mae);
}
