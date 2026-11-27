'use strict';

const branches = ['足軽', '長槍', '騎馬', '母衣', '弓', '強弓', '鉄砲', '剣豪', '忍者'];
const structure = '物体（里・城）';
const number = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 2});
const get = selector => document.querySelector(selector);

function loadFormations() {
  const raw = new URLSearchParams(location.hash.slice(1)).get('formation');
  if (!raw) return {formations: []};
  try {
    const data = JSON.parse(raw);
    return {
      active: data.active,
      formations: data.formations.filter(formation =>
        Number.isInteger(formation?.index) && formation.index >= 1 && formation.index <= 6 &&
        branches.includes(formation.branch) && typeof formation.general === 'string' &&
        formation.bonuses && typeof formation.bonuses === 'object'
      ).slice(0, 6)
    };
  } catch {
    return {formations: []};
  }
}

const {active, formations} = loadFormations();
const attacker = get('#attack');
const defender = get('#defense');
const affinity = get('#affinity');
const tactic = get('#tactic');

function setupSide(side, canDefendStructure) {
  const branch = side.querySelector('.branch');
  const formation = side.querySelector('.formation');
  for (const name of branches) branch.add(new Option(name, name));
  if (canDefendStructure) branch.add(new Option(structure, structure));
  for (const source of formations) {
    formation.add(new Option(`編制${source.index} · ${source.general}（${source.branch}）`, source.index));
  }
  const useFormationBranch = () => {
    const source = selectedFormation(side);
    if (source) branch.value = source.branch;
  };
  if (!canDefendStructure) {
    const activeSource = formations.find(source => source.index === active);
    if (activeSource) formation.value = String(activeSource.index);
    useFormationBranch();
  }
  formation.addEventListener('change', useFormationBranch);
  branch.addEventListener('change', () => {
    const source = selectedFormation(side);
    if (source && source.branch !== branch.value) formation.value = '';
  });
  side.addEventListener('input', event => {
    if (event.target.type === 'number') render();
  });
  side.addEventListener('change', render);
}

function selectedFormation(side) {
  return formations.find(source => String(source.index) === side.querySelector('.formation').value);
}

function readNumber(input) {
  return input.validity.valid && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
}

function readSide(side, isStructure) {
  const formationSelect = side.querySelector('.formation');
  const source = isStructure ? null : selectedFormation(side);
  const note = side.querySelector('.source-note');
  formationSelect.disabled = isStructure || !formations.length;
  note.textContent = isStructure ? '物体の防御は任意です。' : '';
  if (!isStructure && !formations.length) note.textContent = '武将を配置した編制から開くと、技能補正を選べます。';
  if (source) note.textContent = '兵科を変更すると、編制の技能補正が解除されます。';

  const base = {};
  const adjusted = {};
  for (const input of side.querySelectorAll('[data-stat]')) {
    const stat = input.dataset.stat;
    const unitOnly = input.closest('[data-unit]');
    if (unitOnly) unitOnly.hidden = isStructure;
    const ability = source?.bonuses[stat];
    const bonus = Number.isFinite(ability?.percent) ? ability.percent : 0;
    const skills = Array.isArray(ability?.skills) ? ability.skills.filter(skill => typeof skill === 'string') : [];
    const value = isStructure && stat === '防御' && !input.value && input.validity.valid ? 0 : readNumber(input);
    const result = value === null ? null : Math.max(0, value * (1 + bonus / 100));
    base[stat] = value;
    adjusted[stat] = result;

    const readout = document.getElementById(input.getAttribute('aria-describedby'));
    const bonusText = `技能 ${bonus >= 0 ? '+' : ''}${number.format(bonus)}%`;
    const text = source ? [bonusText, ...skills].join(' · ') : '';
    if (result === null || (isStructure && !input.value)) {
      readout.textContent = text;
    } else {
      const adjustedValue = document.createElement('strong');
      adjustedValue.textContent = number.format(result);
      readout.replaceChildren('計算に使用 ', adjustedValue, text ? `（${text}）` : '');
    }
  }
  return {base, adjusted};
}

function estimate(attack, defense, affinityPercent, powerPercent) {
  if ([attack, defense, affinityPercent, powerPercent].includes(null)) return null;
  if (attack === 0) return 0;
  return Math.round(attack * (2 * attack / (attack + defense)) * (affinityPercent / 100) * (powerPercent / 100));
}

function render() {
  const isStructure = defender.querySelector('.branch').value === structure;
  get('#affinity-setting').hidden = isStructure;
  const attack = readSide(attacker, false);
  const defense = readSide(defender, isStructure);
  const affinityPercent = isStructure ? 100 : readNumber(affinity);
  const power = readNumber(tactic);
  const rows = [
    ['normal', '攻撃', '防御', false, 100],
    ['strength', '武勇', '武勇', false, power],
    ['intelligence', '知略', '知略', false, power],
    ['structure', '破壊', '防御', true, 100],
    ['demolition', '破壊', '防御', true, power]
  ];
  for (const [kind, offense, resistance, structureOnly, potency] of rows) {
    const row = get(`[data-result="${kind}"]`);
    row.hidden = isStructure !== structureOnly;
    if (row.hidden) continue;
    for (const [index, scope] of ['base', 'adjusted'].entries()) {
      const damage = estimate(attack[scope][offense], defense[scope][resistance], affinityPercent, potency);
      row.cells[index + 1].textContent = damage === null ? '—' : number.format(damage);
    }
  }
  const invalid = [...document.querySelectorAll('input')].some(input => !input.closest('[hidden]') && !input.validity.valid);
  get('#input-status').textContent = invalid
    ? '入力範囲を確認してください。'
    : '必要な能力値を入力した行から結果が表示されます。';
}

setupSide(attacker, false);
setupSide(defender, true);
affinity.addEventListener('input', render);
tactic.addEventListener('input', render);
render();
