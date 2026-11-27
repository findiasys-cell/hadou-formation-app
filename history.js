const historyDays = new Map();

for (const entry of document.querySelectorAll('main > section')) {
  const title = entry.querySelector(':scope > h2');
  const match = title?.textContent.trim().match(
    /^(?:(\d{4})年(\d{1,2})月(\d{1,2})日|(\d{4})-(\d{2})-(\d{2}))\s+—\s+(.+)$/
  );
  if (!match) continue;

  const year = match[1] || match[4];
  const month = Number(match[2] || match[5]);
  const day = Number(match[3] || match[6]);
  const date = `${year}年${month}月${day}日`;
  let group = historyDays.get(date);

  if (!group) {
    group = document.createElement('section');
    group.className = 'history-day';
    const heading = document.createElement('h2');
    heading.textContent = date;
    group.append(heading);
    entry.before(group);
    historyDays.set(date, group);
  }

  const article = document.createElement('article');
  article.className = 'history-entry';
  const heading = document.createElement('h3');
  heading.textContent = match[7];
  title.replaceWith(heading);
  article.append(...entry.childNodes);
  group.append(article);
  entry.remove();
}
