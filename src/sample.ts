import { createCampaign, createCharacter, id } from './domain/defaults';
import type { Aspect } from './domain/types';
import { loadLanternCoastMap } from './sample-map';
export async function sampleCampaign() {
  const c = createCampaign('The Lantern Coast');
  c.tagline = 'Keep a light burning. Something is coming in with the tide.';
  c.setting =
    'A rain-soaked coast of lighthouse towns, old promises, and strange tides. The last beacon has gone dark, and the people who remember why are disappearing.';
  c.scale = 'A handful of coastal towns, and the secrets between them.';
  c.issues = [
    { id: id(), name: 'The lights are going out', kind: 'game', freeInvokes: 0, visibility: 'shared' },
    { id: id(), name: 'Every favor has a price', kind: 'game', freeInvokes: 0, visibility: 'shared' },
  ];
  const names = ['Mara Voss', 'Silas Reed', 'Wren Ashford'];
  const concepts = [
    'Keeper of the last lighthouse',
    'A smuggler with a borrowed heart',
    'The storm answers when I call',
  ];
  const troubles = [
    'I never leave anyone behind',
    'The sea remembers my debt',
    'Power is easier than patience',
  ];
  const skillOrders = [
    [
      'notice',
      'will',
      'crafts',
      'athletics',
      'lore',
      'shoot',
      'contacts',
      'empathy',
      'investigate',
      'physique',
    ],
    [
      'deceive',
      'burglary',
      'stealth',
      'athletics',
      'contacts',
      'drive',
      'fight',
      'notice',
      'rapport',
      'resources',
    ],
    [
      'lore',
      'will',
      'empathy',
      'investigate',
      'notice',
      'rapport',
      'athletics',
      'contacts',
      'deceive',
      'physique',
    ],
  ];
  c.characters = names.map((name, i) => {
    const ch = createCharacter(c.rules, name);
    const labels = [
      concepts[i],
      troubles[i],
      'A promise made at low tide',
      'I know someone in every port',
      'We weather the storm together',
    ];
    ch.aspects = labels.map(
      (name, k) =>
        ({
          id: id(),
          name,
          kind: k === 0 ? 'highConcept' : k === 1 ? 'trouble' : 'character',
          freeInvokes: 0,
          visibility: 'shared',
        }) as Aspect,
    );
    skillOrders[i].forEach((s, k) => {
      ch.skills[s] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1][k];
    });
    ch.description = [
      'Steady hands, salt-stained coat, and a stubborn belief that every lost ship can find its way home.',
      'A silver tongue and a ledger of debts. He knows the hidden paths along the coast.',
      'An apprentice weather-reader whose talent keeps outrunning their judgment.',
    ][i];
    ch.creationMode = 'quick';
    return ch;
  });
  c.world = [
    {
      id: id(),
      kind: 'location',
      title: 'Bellweather Harbor',
      body: 'Fishing boats crowd the old stone quay. At dusk, people leave candles in their windows for those still at sea.\n\nConnections: the lighthouse, the chandlery, the flooded road north.',
      tags: ['coast', 'home'],
      visibility: 'shared',
    },
    {
      id: id(),
      kind: 'note',
      title: 'The first night',
      body: 'Begin at the harbor as a crewless boat drifts in. Its lantern is still warm. Ask each character what they recognize on board.',
      tags: ['opening'],
      visibility: 'gm',
    },
  ];
  c.inventory = [
    {
      id: id(),
      revision: 0,
      name: 'Storm lantern',
      quantity: 1,
      unit: 'item',
      ownerId: 'party',
      description: 'A reliable light in unreliable weather.',
      visibility: 'shared',
    },
  ];
  const { asset, map } = await loadLanternCoastMap(c.characters);
  c.assets.push(asset);
  c.maps.push(map);
  return c;
}
