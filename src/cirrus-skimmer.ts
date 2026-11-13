import metadata from './content/accelerated-metadata.json';
import { createAspect, createCampaign, createCharacter, id } from './domain/defaults';
import type { Character, Stunt, WorldEntry } from './domain/types';
import { loadSeaOfCloudsMap } from './cirrus-skimmer-map';

export const CIRRUS_SOURCES = [
  {
    element: 'Voltaire and the Cirrus Skimmer',
    section: 'Voltaire',
    line: 1162,
    evidence: 'Swashbuckling Swordswoman',
    changes:
      'Aspects, approach ratings, refresh, and stunt effect retained; description and stunt wording condensed. The reminder about unused free stunts is omitted because the app tracks that allowance.',
  },
  {
    element: 'Sky shark',
    section: 'Bad Guys',
    line: 1026,
    evidence: 'Vulnerable Belly',
    changes:
      'The sky shark’s aspects, specialties, weakness, and two-box stress capacity are adapted into the mook profile. The naval boarding party is an original companion group using the same group rules.',
  },
  {
    element: 'Sky pirates pursued by the Royal Navy',
    section: 'Help Build Campaigns',
    line: 947,
    evidence: 'Royal Navy',
    changes:
      'Uses the SRD’s suggested campaign premise. Cloudbreak Anchorage, the stormglass cargo, pursuing officer, opening scene, crew builds, and all specific plot connections are original companion additions.',
  },
] as const;

const stunt = (name: string, description: string): Stunt => ({
  id: id(),
  name,
  description,
  refreshCost: 1,
  fateCost: 0,
  limit: 'none',
  uses: 0,
  maxUses: 1,
});

/** One official example PC in a clearly identified companion-written adventure. */
export async function cirrusSkimmerCampaign() {
  const c = createCampaign('Cirrus Skimmer', 'fate-accelerated');
  c.tagline = 'Keep the ship flying. Get the cargo home.';
  c.setting =
    'Skyships cross a sea of clouds between scattered ports. Captain Voltaire and her crew sail the Cirrus Skimmer, pursued by the Royal Navy. Their next delivery could keep an isolated anchorage aloft.';
  c.scale = 'One skyship, one threatened port, and the clouds between them.';
  c.issues = [
    createAspect('game', 'The Royal Navy Is Closing In'),
    createAspect('game', 'Cloudbreak Cannot Survive Another Storm'),
  ];
  const pc = (
    name: string,
    description: string,
    aspects: string[],
    ratings: number[],
    stunts: Stunt[],
  ): Character => {
    const ch = createCharacter(c.rules, name);
    ch.description = description;
    ch.aspects.forEach((aspect, index) => {
      aspect.name = aspects[index] ?? '';
    });
    ch.skills = Object.fromEntries(c.rules.skills.map((approach, index) => [approach.id, ratings[index]]));
    ch.stunts = stunts;
    ch.status = 'ready';
    return ch;
  };
  const voltaire = pc(
    'Voltaire',
    'The Cirrus Skimmer’s feline captain: a flamboyant sky pirate with a feathered cap, a cutlass, and a habit of falling asleep at inconvenient moments.',
    [
      'Feline Captain of Cirrus Skimmer',
      '*Yawn*',
      'That? Oh, That’s a Decoy',
      'Martin Is a Big Cheat',
      'Sanchez Is the Best First Mate a Ship Could Have',
    ],
    [1, 1, 3, 0, 2, 2],
    [
      stunt(
        'Swashbuckling Swordswoman',
        'Gain +2 to Flashy attacks when crossing blades with a single opponent.',
      ),
    ],
  );
  const sanchez = pc(
    'Sanchez',
    'The ship’s practical first mate. A steady voice, a strong grip on the rigging, and complete confidence in the captain when it matters.',
    [
      'First Mate Who Keeps the Cirrus Skimmer Flying',
      'The Crew Comes Before the Plan',
      'Voltaire Has Never Let Me Down',
      'I Know Every Rope on This Ship',
      'We Leave Nobody Below the Clouds',
    ],
    [3, 1, 0, 2, 2, 1],
    [stunt('Hold the Line', 'Gain +2 to Carefully defend when protecting a crewmate on a skyship.')],
  );
  const mira = pc(
    'Mira Vale',
    'An inventive navigator and shipwright who can coax another mile from a failing engine. Cloudbreak is home, and this delivery matters to her.',
    [
      'Stormwise Navigator and Improvising Shipwright',
      'I Can Fix It If You Give Me One More Minute',
      'Cloudbreak Is My Home',
      'The Clouds Tell Me Where to Go',
      'An Unlikely Tool for Every Job',
    ],
    [2, 3, 1, 0, 2, 1],
    [
      stunt(
        'Running Repairs',
        'Gain +2 to Cleverly overcome when repairing a skyship with improvised materials under pressure.',
      ),
    ],
  );
  c.characters.push(voltaire, sanchez, mira);

  const shark = createCharacter(c.rules, 'Sky shark', 'nameless');
  shark.description = 'A predator cruising the cloud banks beneath the ship.';
  shark.aspects[0].name = 'I’m a Shark';
  shark.aspects[1].name = 'Vulnerable Belly';
  shark.mook = { goodAt: 'Flying, biting', badAt: 'Anything that isn’t flying or biting', stressBoxes: 2 };
  shark.status = 'ready';
  const boarders = createCharacter(c.rules, 'Naval boarding party', 'nameless');
  boarders.description = 'Four sailors trying to secure the cargo and take the crew alive.';
  boarders.aspects[0].name = 'Four Sailors, One Boarding Line';
  boarders.aspects[1].name = 'Orders Before Initiative';
  boarders.mook = {
    goodAt: 'Boarding together, holding a chokepoint',
    badAt: 'Improvising, fighting when separated',
    stressBoxes: 0,
    groupSize: 4,
  };
  boarders.status = 'ready';
  const officer = createCharacter(c.rules, 'Lieutenant Rowan', 'supporting');
  officer.description = 'A naval officer who wants the ship surrendered with the cargo intact.';
  officer.aspects[0].name = 'Relentless Officer of the Royal Navy';
  officer.aspects[1].name = 'I Must Bring Them In Alive';
  officer.aspects[2].name = 'A Promise Is Still a Promise';
  officer.skills = { careful: 2, clever: 2, flashy: 1, forceful: 3, quick: 1, sneaky: 0 };
  officer.status = 'ready';
  c.characters.push(shark, boarders, officer);

  const entry = (
    kind: WorldEntry['kind'],
    title: string,
    body: string,
    visibility: WorldEntry['visibility'] = 'shared',
    tags: string[] = [],
  ): WorldEntry => ({ id: id(), kind, title, body, visibility, tags });
  c.world = [
    entry(
      'location',
      'The Cirrus Skimmer',
      'Voltaire’s skyship. The open deck, rigging, helm, and engine room each offer a different way to solve a problem. Agree on fictional distances and treat these areas as zones when useful.',
      'shared',
      ['skyship'],
    ),
    entry(
      'location',
      'Cloudbreak Anchorage',
      'A small port above the clouds. Its stormglass stabilizer is failing, and the crew has promised to deliver a replacement before the next storm.',
      'shared',
      ['port'],
    ),
    entry(
      'faction',
      'The Royal Navy',
      'Naval patrols want the Cirrus Skimmer brought in. Ask the players what the crew did to earn this attention and what would persuade a particular officer to listen.',
      'shared',
      ['opposition'],
    ),
    entry(
      'note',
      'Crew connections',
      'Ask Voltaire how Sanchez earned her trust. Ask Sanchez what the captain does better than anyone else. Ask Mira who is waiting for her in Cloudbreak. The players’ answers establish those details.',
      'shared',
      ['characters'],
    ),
    entry(
      'note',
      'Opening: delivery through the clouds',
      'Begin with the Cirrus Skimmer approaching a storm front. A naval cutter breaks out of the clouds behind it as the engine starts to cough. The crew must get the stormglass to Cloudbreak. Ask everyone what they are doing when the pursuit begins. Reveal the sky shark when a character looks below the clouds; it need not become a fight.',
      'gm',
      ['opening'],
    ),
    entry(
      'note',
      'Running the opening',
      'Start with an Overcome action for an immediate obstacle, or let a player create an advantage by preparing a decoy, studying the weather, or securing the cargo. Choose the approach from how the player describes acting. A short contest can resolve the chase; use a conflict only if someone is trying to cause harm. A sky shark demonstrates a mook, and the four naval sailors demonstrate a group. Introduce Lieutenant Rowan if the crew negotiates or is boarded. Keep all NPCs private until they enter the fiction.',
      'gm',
      ['preparation'],
    ),
    entry(
      'note',
      'Possible turns',
      'A route through the storm, a convincing decoy, repairing the engine, or bargaining with Rowan can all change the situation. Mira might risk the delivery to protect Cloudbreak; Sanchez might have to choose between the plan and a crewmate. Let the players supply costs and consequences. Success does not require defeating every opponent, and no ending is predetermined.',
      'gm',
      ['preparation'],
    ),
    entry(
      'reference',
      'Cirrus Skimmer — sources and credits',
      `©2013 Evil Hat Productions, LLC.\n\n${metadata.attribution}\n\nCreative Commons Attribution 3.0 Unported: ${metadata.licenseUrl}\n\nThis is an independent companion starter, not an official published adventure. Voltaire’s aspects, approaches, refresh, and stunt effect come from the Accelerated SRD; her description and stunt text are condensed. The sky shark uses the SRD’s mook example. The sky-pirate/Royal Navy premise comes from its campaign suggestions. Sanchez is named in Voltaire’s aspect, but his character build and description here are companion additions. Mira Vale, the naval opposition, Cloudbreak Anchorage, the cargo, issues, scene aspects, equipment, and adventure prompts are original companion material. The Sea of Clouds chart and matching banner are original AI-generated companion artwork, not official Fate geography or book artwork.\n\nSource revision: ${metadata.revision}\n\n${CIRRUS_SOURCES.map((source) => `${source.element}\n${source.changes}\n${source.section}: ${metadata.sourceUrl}#L${source.line}`).join('\n\n')}`,
      'shared',
      ['sources', 'CC BY 3.0'],
    ),
  ];
  c.inventory = [
    {
      id: id(),
      revision: 0,
      name: 'Stormglass stabilizer',
      quantity: 1,
      unit: 'crate',
      ownerId: 'party',
      description: 'The replacement promised to Cloudbreak. Valuable, awkward, and fragile.',
      visibility: 'shared',
    },
    {
      id: id(),
      revision: 0,
      name: 'Repair kit',
      quantity: 1,
      unit: 'kit',
      ownerId: mira.id,
      description: 'Tools, spare wire, sailcloth, and a few unlikely solutions.',
      visibility: 'shared',
    },
  ];
  c.play.scenarioName = 'A delivery for Cloudbreak';
  c.play.sessionName = 'Session 1';
  c.play.sceneName = 'Storm on the horizon';
  c.play.aspects = [
    createAspect('situation', 'Storm Front Ahead'),
    createAspect('situation', 'An Engine on Borrowed Time'),
  ];
  c.world.push(
    entry(
      'reference',
      'Sea of Clouds — chart notes',
      'An original companion regional chart for this starter. Cloudbreak Anchorage is the delivery destination; Glasswind Spires, Stormwall, Patrol Reach, Trade Winds Reach, the Quiet Shoals, and the Lower Cloud Sea give the table places to explore. The geography, routes, zone aspects, banner, and chart are original companion material, not official Fate geography. These are travel areas: agree on flight time, obstacles, and tactical scale in the fiction. The crew begins in Trade Winds Reach. Existing campaigns can upload the bundled chart under Maps & zones without replacing their campaign data.',
      'shared',
      ['map', 'sources'],
    ),
  );
  c.play.npcFatePoints = 3;
  const { asset, map } = await loadSeaOfCloudsMap(c.characters);
  c.assets.push(asset);
  c.maps.push(map);
  return c;
}
