'use strict';

const STORAGE_KEY = 'hadou-damage-research-v1';
const FILE_FORMAT = 'hadou-damage-observations';
const MAX_HITS = 10;
const sharedFields = FIELDS.filter(({id}) => id !== 'damage' && id !== 'critical');
const criticalField = FIELDS.find(({id}) => id === 'critical');
const byId = id => document.getElementById(id);
const recordForm = byId('record-form');
const recordStatus = byId('record-status');
const hitRows = byId('hit-rows');
const addHit = byId('add-hit');
const listStatus = byId('list-status');
const parameters = byId('record-parameters');
const note = byId('record-note');
const impactField = byId('impact-field');
const fitGroup = byId('fit-group');
const fileInput = byId('import-file');
const number = new Intl.NumberFormat('ja-JP', {maximumFractionDigits:2});
const coefficient = new Intl.NumberFormat('ja-JP', {maximumSignificantDigits:6});
let records = [];
let editing = null;
let newRecordDraft = null;
let groups = [];
let storageUnavailable = false;

function makeFieldInput(field) {
  const input = document.createElement(field.options ? 'select' : 'input');
  input.required = !!field.required;
  if (field.options) {
    input.add(new Option(field.empty ?? (field.required ? '選択してください' : '不明'), ''));
    for (const value of field.options) input.add(new Option(value, value));
  } else {
    input.type = 'number';
    input.min = 0;
    input.max = MAX_NUMBER;
    input.step = field.integer ? '1' : 'any';
    input.inputMode = field.integer ? 'numeric' : 'decimal';
  }
  return input;
}

function labeledInput(input, text) {
  const label = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = text;
  label.append(name, input);
  return label;
}

function makeFields(container, definitions) {
  for (const field of definitions) {
    const input = makeFieldInput(field);
    input.id = 'field-' + field.id;
    container.append(labeledInput(input, field.label));
  }
}

function updateHitRows() {
  const count = hitRows.children.length;
  [...hitRows.children].forEach((row, index) => {
    row.querySelector('label:first-child span').textContent = `ダメージ ${index+1}`;
    row.querySelector('label:nth-child(2) span').textContent = `会心 ${index+1}`;
    const remove = row.querySelector('button');
    remove.setAttribute('aria-label', `入力行 ${index+1} を削除`);
    remove.hidden = count === 1;
  });
  addHit.disabled = count >= MAX_HITS;
  byId('hit-count').textContent = `${count} / ${MAX_HITS} 行`;
}

function appendHitRow(hit = {}) {
  const row = document.createElement('div');
  row.className = 'hit-row';
  const damage = makeFieldInput({integer:true, required:editing !== null});
  const critical = makeFieldInput(criticalField);
  damage.value = hit.damage ?? '';
  critical.value = hit.critical ?? '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '−';
  remove.addEventListener('click', () => {
    const nextFocus = row.nextElementSibling ?? row.previousElementSibling;
    row.remove();
    updateHitRows();
    nextFocus.querySelector('input').focus();
  });
  row.append(labeledInput(damage,''), labeledInput(critical,''), remove);
  hitRows.append(row);
  updateHitRows();
  return damage;
}

addHit.addEventListener('click', () => {
  if (hitRows.children.length < MAX_HITS) appendHitRow().focus();
});

function fieldInput(fieldId) {
  return byId('field-' + fieldId);
}

function validateFile(data) {
  if (data?.format !== FILE_FORMAT || data.version !== 1 || !Array.isArray(data.records)) {
    throw new Error('実測データのJSONファイルを選んでください。');
  }
  if (data.records.length > MAX_RECORDS) throw new Error(`実測は最大${MAX_RECORDS}件です。`);
  return data.records.map(readRecord);
}

function exportData(values) {
  return {format:FILE_FORMAT, version:1, records:values};
}

function saveRecords(next) {
  if (next.length > MAX_RECORDS) throw new Error(`実測は最大${MAX_RECORDS}件です。`);
  try {
    if (storageUnavailable) throw new Error();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exportData(next)));
  } catch {
    throw new Error('ブラウザーに保存できません。保存領域の設定や空き容量を確認してください。');
  }
  records = next;
  renderAll();
}

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) records = validateFile(JSON.parse(saved));
  } catch {
    storageUnavailable = true;
    listStatus.textContent = '保存済みの実測を読み込めませんでした。保存データは保持されています。';
  }
}

function startEdit(index) {
  if (editing === null) {
    newRecordDraft = {
      rows:[...hitRows.children],
      values:sharedFields.map(field => fieldInput(field.id).value),
      parameters:parameters.value,
      note:note.value
    };
  }
  const record = records[index];
  editing = index;
  hitRows.replaceChildren();
  for (const field of sharedFields) fieldInput(field.id).value = record[field.id] ?? '';
  parameters.value = Object.entries(record.params).map(([key,value]) => `${key}=${value}`).join('\n');
  note.value = record.note;
  recordStatus.textContent = '';
  byId('form-title').textContent = '実測を編集';
  byId('save-record').textContent = '編集を保存';
  byId('cancel-edit').hidden = false;
  byId('batch-actions').hidden = true;
  byId('batch-help').hidden = true;
  byId('shared-help').hidden = true;
  appendHitRow(record).focus();
}

function finishEdit() {
  editing = null;
  hitRows.replaceChildren(...newRecordDraft.rows);
  sharedFields.forEach((field,index) => fieldInput(field.id).value = newRecordDraft.values[index]);
  parameters.value = newRecordDraft.parameters;
  note.value = newRecordDraft.note;
  newRecordDraft = null;
  byId('form-title').textContent = '実測を記録';
  byId('save-record').textContent = 'まとめて保存';
  byId('cancel-edit').hidden = true;
  byId('batch-actions').hidden = false;
  byId('batch-help').hidden = false;
  byId('shared-help').hidden = false;
  updateHitRows();
}

recordForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const hits = [...hitRows.children].flatMap(row => {
      const damage = row.querySelector('input');
      const critical = row.querySelector('select');
      return damage.value === '' ? [] : [{damage:damage.valueAsNumber, critical:critical.value || null}];
    });
    const firstDamage = hitRows.querySelector('input');
    if (!hits.length) {
      firstDamage.focus();
      throw new Error('ダメージを1件以上入力してください。');
    }
    const values = Object.fromEntries(sharedFields.map(field => {
      const input = fieldInput(field.id);
      const value = input.value === '' ? null : field.options ? input.value : input.valueAsNumber;
      return [field.id, value];
    }));
    const shared = {...values, params:parseParameters(parameters.value), note:note.value.trim()};
    const additions = hits.map(hit => readRecord({...shared, ...hit}));
    const next = records.slice();
    if (editing === null) {
      next.push(...additions);
      saveRecords(next);
      for (const element of hitRows.querySelectorAll('input, select')) element.value = '';
      firstDamage.focus();
      recordStatus.textContent = `${additions.length}件を保存しました。`;
    } else {
      next[editing] = additions[0];
      saveRecords(next);
      finishEdit();
      recordStatus.textContent = '編集を保存しました。';
    }
  } catch (error) {
    recordStatus.textContent = error.message;
  }
});

byId('cancel-edit').addEventListener('click', () => {
  finishEdit();
  recordStatus.textContent = '';
  hitRows.querySelector('input').focus();
});

function signed(value, suffix='') {
  if (value === null) return '—';
  const rounded = Math.round(value*100)/100;
  return (rounded > 0 ? '+' : '') + number.format(rounded) + suffix;
}

function showRows(bodyId, values) {
  const fragment = document.createDocumentFragment();
  for (const row of values) {
    const tr = document.createElement('tr');
    for (const [index, value] of row.entries()) {
      const cell = document.createElement(index ? 'td' : 'th');
      if (!index) cell.scope = 'row';
      cell.textContent = value;
      tr.append(cell);
    }
    fragment.append(tr);
  }
  byId(bodyId).replaceChildren(fragment);
}

function renderImpact() {
  const contrasts = compareParameter(records, impactField.value);
  const limit = 40;
  byId('impact-results').hidden = !contrasts.length;
  const status = byId('impact-status');
  status.textContent = '選んだ項目だけを変えた実測が揃うと、ダメージの差を表示します。';
  if (contrasts.length) {
    const count = contrasts.length > limit ? `値の組み合わせ${contrasts.length}件のうち、比較できた条件の多い${limit}件を表示します。 ` : '';
    status.textContent = count + '変化率は、変更前が0ダメージの条件を除いて平均します。';
  }
  showRows('impact-rows', contrasts.slice(0,limit).map(row => [
    `${row.low} → ${row.high}`, signed(row.diff), signed(row.ratio,'%'), row.count, `${row.a} / ${row.b}`
  ]));
}

function renderFit() {
  const group = groups[Number(fitGroup.value)];
  const candidates = group ? fitModels(group.samples) : [];
  byId('fit-results').hidden = !candidates.length;
  byId('fit-status').textContent = candidates.length
    ? `${group.samples.length}件で比較。誤差が近い候補は、このデータだけでは区別できません。`
    : '同じ条件の実測が4件以上、かつ、攻側・防側の能力値の組み合わせが2通り以上あると比較できます。候補の式が計算できる能力値が必要です。';
  showRows('fit-rows', candidates.map(result => [result.name, coefficient.format(result.k), number.format(result.mae)]));
}

function renderSelects() {
  const previousField = impactField.value;
  const names = [...new Set(records.flatMap(record => Object.keys(record.params)))].sort(collator.compare);
  const fields = FIELDS.filter(field => field.id !== 'damage').map(field => [field.id, field.label]);
  impactField.replaceChildren(...[...fields, ...names.map(name => ['param:' + name, name])]
    .map(([id,label]) => new Option(label,id)));
  impactField.value = [...impactField.options].some(option => option.value === previousField) ? previousField : 'critical';

  const previousGroup = groups[Number(fitGroup.value)]?.key;
  groups = fitGroups(records);
  fitGroup.replaceChildren(...groups.map((group,index) => {
    const parts = group.context.filter(([,value]) => value !== null).map(([field,value]) => field === 'kind'
      ? value : `${describeParameter(field)} ${value}`);
    return new Option(`${group.samples.length}件｜${parts.join(' / ')}`,index);
  }));
  fitGroup.disabled = !groups.length;
  if (!groups.length) fitGroup.add(new Option('能力値の揃った実測がありません',''));
  const matching = groups.findIndex(group => group.key === previousGroup);
  if (matching >= 0) fitGroup.value = String(matching);
}

function renderList() {
  byId('record-count').textContent = `${records.length}件`;
  byId('export-records').disabled = !records.length;
  const items = records.map((record,index) => {
    const entry = document.createElement('details');
    entry.className = 'record';
    const header = document.createElement('summary');
    header.textContent = `#${index+1}　${record.kind}　${number.format(record.damage)}ダメージ　会心 ${record.critical ?? '不明'}`;
    const detail = document.createElement('p');
    detail.textContent = [
      ...conditions(record,new Set(['kind','critical'])).filter(([,value]) => value !== null)
        .map(([key,value]) => `${describeParameter(key)} ${value}`),
      record.note
    ].filter(Boolean).join(' ／ ') || '追加の条件は空欄です。';
    const actions = document.createElement('div');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.textContent = '編集';
    edit.addEventListener('click', () => startEdit(index));
    const remove = document.createElement('button');
    remove.textContent = '削除';
    remove.addEventListener('click', () => {
      if (!confirm(`実測 #${index+1} を削除しますか？`)) return;
      try {
        saveRecords(records.filter((_,i) => i !== index));
        if (editing === index) {
          finishEdit();
          recordStatus.textContent = '';
        } else if (editing !== null && editing > index) {
          editing--;
        }
        listStatus.textContent = '実測を削除しました。';
      } catch (error) {
        listStatus.textContent = error.message;
      }
    });
    actions.append(edit,remove);
    entry.append(header,detail,actions);
    return entry;
  }).reverse();
  byId('record-list').replaceChildren(...items);
}

function renderAll() {
  renderSelects();
  renderImpact();
  renderFit();
  renderList();
}

byId('export-records').addEventListener('click', () => {
  const data = new Blob([JSON.stringify(exportData(records),null,2)],{type:'application/json'});
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = '覇道ダメージ実測.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});
byId('import-records').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const [file] = fileInput.files;
  if (!file) return;
  try {
    if (file.size > 5000000) throw new Error('ファイルは5MB以下にしてください。');
    const imported = validateFile(JSON.parse(await file.text()));
    saveRecords([...records,...imported]);
    listStatus.textContent = `${imported.length}件を一覧に追加しました。`;
  } catch (error) {
    listStatus.textContent = error instanceof SyntaxError ? 'JSONの形式を確認してください。' : error.message;
  } finally {
    fileInput.value = '';
  }
});
impactField.addEventListener('change', renderImpact);
fitGroup.addEventListener('change', renderFit);

for (const [group,fields] of Object.entries(FIELD_GROUPS)) {
  makeFields(byId(group+'-fields'), fields.filter(field => sharedFields.includes(field)));
}
appendHitRow();
loadRecords();
renderAll();
