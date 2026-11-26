import { Component } from '@theme/component';

const regionNames = {
  CA: { AB: 'Alberta', BC: 'British Columbia', ON: 'Ontario', SK: 'Saskatchewan' },
  US: {
    IL: 'Illinois', IN: 'Indiana', MA: 'Massachusetts', MD: 'Maryland', MI: 'Michigan',
    NY: 'New York', OH: 'Ohio', OR: 'Oregon', PA: 'Pennsylvania', WA: 'Washington', WI: 'Wisconsin',
  },
};

/**
 * @typedef {Object} DirectoryRefs
 * @property {HTMLElement} source
 * @property {HTMLElement} controls
 * @property {HTMLElement} results
 * @property {HTMLInputElement} search
 * @property {HTMLButtonElement[]} filters
 * @property {HTMLButtonElement} clear
 * @property {HTMLElement} status
 * @property {HTMLUListElement} grid
 * @property {HTMLElement} empty
 */

/** @extends {Component<DirectoryRefs>} */
class RetailerDirectory extends Component {
  requiredRefs = ['source', 'controls', 'results', 'search', 'filters', 'clear', 'status', 'grid', 'empty'];

  /** @type {{element: HTMLLIElement, text: string, country: string, online: boolean, physical: boolean}[]} */
  #cards = [];
  #sourceMarkup = '';
  #filter = 'all';
  #controller = new AbortController();

  connectedCallback() {
    super.connectedCallback();
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#build();
    this.#readHash();
    window.addEventListener('hashchange', this.#readHash, { signal: this.#controller.signal });
  }

  updatedCallback() {
    super.updatedCallback();
    this.#build();
    this.#apply();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
  }

  /** @param {Element} element */
  #text(element) {
    const copy = element.cloneNode(true);
    if (!(copy instanceof Element)) return '';
    for (const br of copy.querySelectorAll('br')) br.replaceWith(' ');
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /** @param {string} text */
  #normalize(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  }

  #build() {
    const { source, controls, results, grid } = this.refs;
    if (this.dataset.source === 'metaobjects') {
      this.#cards = [...grid.querySelectorAll(':scope > li')].map((element) => {
        const country = element.dataset.country ?? '';
        const region = element.dataset.region ?? '';
        const countryLabel = country === 'CA' ? this.dataset.canada : country === 'US' ? 'United States USA' : country;
        return {
          element,
          country,
          online: element.dataset.online === 'true',
          physical: element.dataset.physical === 'true',
          text: this.#normalize([this.#text(element), country, countryLabel, regionNames[country]?.[region] ?? ''].join(' ')),
        };
      });
      source.hidden = true;
      controls.hidden = false;
      results.hidden = false;
      return;
    }
    if (source.innerHTML === this.#sourceMarkup && this.#cards.every((card) => grid.contains(card.element))) return;

    source.hidden = false;
    controls.hidden = true;
    results.hidden = true;
    this.#cards = [];
    const tables = [...source.querySelectorAll('table')];
    const cards = [];
    for (const table of tables) {
      const header = table.tHead?.rows[0];
      if (!header || header.cells.length < 7) return;
      const online = this.#text(header.cells[3]).toLowerCase().includes('online');
      for (const row of table.querySelectorAll('tbody > tr')) {
        if (!(row instanceof HTMLTableRowElement) || row.cells.length < 7) return;
        const cells = [...row.cells];
        const values = cells.map((cell) => this.#text(cell));
        const [country, region, city, store, phone] = values;
        if (!store || !country) return;
        const countryLabel = country === 'CA' ? this.dataset.canada : country === 'US' ? this.dataset.usa : country;
        const element = document.createElement('li');
        element.className = 'retailer-directory__card';
        const location = document.createElement('p');
        location.className = 'retailer-directory__location';
        location.textContent = [online ? this.dataset.online : '', countryLabel, region].filter(Boolean).join(' · ');
        const heading = document.createElement('h2');
        heading.className = 'retailer-directory__name';
        const separator = store.indexOf(',');
        const name = separator < 0 ? store : store.slice(0, separator);
        heading.textContent = name;
        const address = document.createElement('p');
        address.className = 'retailer-directory__address';
        address.textContent = [separator < 0 ? '' : store.slice(separator + 1).trim(), city].filter(Boolean).join(', ');
        element.append(location, heading, address);
        if (phone) {
          const tel = document.createElement('a');
          tel.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
          tel.textContent = phone;
          element.append(tel);
        }
        const links = document.createElement('div');
        links.className = 'retailer-directory__links';
        for (const [index, cell] of cells.entries()) {
          if (index < 5) continue;
          for (const sourceLink of cell.querySelectorAll('a[href]')) {
            let url;
            try {
              url = new URL(sourceLink.href, window.location.href);
            } catch {
              return;
            }
            if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return;
            const label = index === 5
              ? url.protocol === 'mailto:' ? this.dataset.email : this.dataset.contact
              : index === 6 ? this.dataset.website : this.dataset.social;
            const link = document.createElement('a');
            link.href = url.href;
            link.textContent = label ?? this.#text(sourceLink);
            link.setAttribute('aria-label', `${link.textContent}: ${name}`);
            if (sourceLink.target === '_blank') {
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
            }
            links.append(link);
          }
        }
        element.append(links);
        cards.push({ element, country, online, physical: !online, text: this.#normalize([...values, countryLabel, country === 'US' ? 'United States United States of America' : '', regionNames[country]?.[region] ?? '', online ? this.dataset.online : ''].join(' ')) });
      }
    }
    if (!cards.length) return;
    grid.replaceChildren(...cards.map((card) => card.element));
    this.#cards = cards;
    this.#sourceMarkup = source.innerHTML;
    source.hidden = true;
    controls.hidden = false;
    results.hidden = false;
  }

  #readHash = () => {
    const hash = window.location.hash.toLowerCase();
    this.#filter = hash === '#ca' ? 'CA' : hash === '#us' ? 'US' : hash === '#online' ? 'online' : 'all';
    this.#apply();
  };

  #apply() {
    const terms = this.#normalize(this.refs.search.value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const card of this.#cards) {
      const matchesFilter = this.#filter === 'all' || (this.#filter === 'online' ? card.online : card.physical && card.country === this.#filter);
      const visible = matchesFilter && terms.every((term) => card.text.includes(term));
      card.element.hidden = !visible;
      if (visible) count++;
    }
    for (const button of this.refs.filters) button.setAttribute('aria-pressed', String(button.dataset.filter === this.#filter));
    this.refs.status.textContent = (this.dataset.countLabel ?? '').replace('__COUNT__', new Intl.NumberFormat(document.documentElement.lang || 'en').format(count));
    this.refs.empty.hidden = count !== 0;
    this.refs.clear.hidden = terms.length === 0 && this.#filter === 'all';
  }

  /** Filters retailer cards as the search field changes. */
  search() {
    this.#apply();
  }

  /** @param {Event} event - A click on a country or online filter. */
  filter(event) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button[data-filter]');
    if (!(button instanceof HTMLButtonElement) || !this.contains(button)) return;
    this.#filter = button.dataset.filter ?? 'all';
    this.#apply();
  }

  /** Clears the query and restores all listings. */
  reset() {
    this.refs.search.value = '';
    this.#filter = 'all';
    this.#apply();
    this.refs.search.focus();
  }
}

if (!customElements.get('retailer-directory')) customElements.define('retailer-directory', RetailerDirectory);
