import sourceMetadata from './content/source-metadata.json';
import { createAspect, createCampaign, createCharacter, id } from './domain/defaults';
import type { Character, Stunt, WorldEntry } from './domain/types';
import { loadRivertonMap } from './hearts-of-steel-map';

/** Each adaptation points to the pinned SRD section that supplies its fictional facts. */
export interface SampleSource {
  element: string;
  section: string;
  line: number;
  evidence: string;
  changes: string;
  visibility: 'shared' | 'gm';
}

export const HEARTS_SOURCES: SampleSource[] = [
  {
    element: 'Campaign premise and cast',
    section: 'Players and Gamemasters',
    line: 71,
    evidence: 'Hearts of Steel',
    changes: 'Premise and character descriptions condensed; tagline newly written.',
    visibility: 'shared',
  },
  {
    element: 'Setting',
    section: 'Making the Setting Work in Fate',
    line: 410,
    evidence: 'low fantasy',
    changes: 'Setting paraphrased.',
    visibility: 'shared',
  },
  {
    element: 'Scale',
    section: 'A Game’s Scale',
    line: 426,
    evidence: 'town to town',
    changes: 'Scale condensed.',
    visibility: 'shared',
  },
  {
    element: 'The Scar Triad; The Doom that Is to Come',
    section: 'Making the Issues into Aspects',
    line: 475,
    evidence: 'The Doom that Is to Come',
    changes: 'Issue names retained; explanations paraphrased.',
    visibility: 'shared',
  },
  {
    element: 'Cult of Tranquility; Two Conflicting Prophecies',
    section: 'Drilling Down',
    line: 492,
    evidence: 'Two Conflicting Prophecies',
    changes: 'Faction description condensed; no prophecy resolved.',
    visibility: 'shared',
  },
  {
    element: 'Riverton; Hugo the Charitable; Kale Westal; the Primarch',
    section: 'Faces and Places',
    line: 503,
    evidence: 'Kale Westal',
    changes:
      'People and place descriptions paraphrased; Primarch identity left open. NPC skill ratings are companion builds.',
    visibility: 'shared',
  },
  {
    element: 'PC high concepts; Ivory Shroud',
    section: 'High Concept',
    line: 636,
    evidence: 'Disciple of the Ivory Shroud',
    changes: 'High concepts retained; martial-arts connection paraphrased.',
    visibility: 'shared',
  },
  {
    element: 'PC troubles; Collegia Arcana',
    section: 'Trouble',
    line: 674,
    evidence: 'Rivals in the Collegia Arcana',
    changes: 'Troubles retained; faction connection paraphrased.',
    visibility: 'shared',
  },
  {
    element: 'Old Finn; I Owe Old Finn Everything',
    section: 'Phase One: Your Adventure',
    line: 786,
    evidence: 'I Owe Old Finn Everything',
    changes: 'Landon’s backstory condensed; Finn’s skill ratings are a companion build.',
    visibility: 'shared',
  },
  {
    element: 'A Sucker for a Sob Story; Landon and Cynere’s connection',
    section: 'Phase Two: Crossing Paths',
    line: 837,
    evidence: 'A Sucker for a Sob Story',
    changes: 'Shared backstory condensed.',
    visibility: 'shared',
  },
  {
    element: 'I’ve Got Zird’s Back; Cynere and Zird’s connection',
    section: 'Phase Three: Crossing Paths Again',
    line: 878,
    evidence: 'I’ve Got Zird’s Back',
    changes: 'Shared backstory condensed.',
    visibility: 'shared',
  },
  {
    element: 'Smashing Is Always an Option',
    section: 'Overcome',
    line: 3088,
    evidence: 'Smashing Is Always an Option',
    changes: 'Aspect retained.',
    visibility: 'shared',
  },
  {
    element: 'An Eye for an Eye',
    section: 'Character Aspect and Issue',
    line: 5020,
    evidence: 'An Eye for an Eye',
    changes: 'Aspect retained; suggested future events are not established history.',
    visibility: 'shared',
  },
  {
    element: 'If I Haven’t Been There, I’ve Read About It',
    section: 'Declaring a Story Detail',
    line: 286,
    evidence: 'If I Haven’t Been There, I’ve Read About It',
    changes: 'Aspect retained.',
    visibility: 'shared',
  },
  {
    element: 'Not the Face!',
    section: 'Decisions',
    line: 1478,
    evidence: 'Not the Face!',
    changes: 'Aspect retained.',
    visibility: 'shared',
  },
  {
    element: 'PC skill pyramids',
    section: 'Skills',
    line: 918,
    evidence: 'One Great (+4) skill',
    changes:
      'Zird’s allocation follows the SRD example. Landon and Cynere have independently completed companion pyramids, not retail-sheet transcriptions.',
    visibility: 'shared',
  },
  {
    element: 'Heavy Hitter; Backup Weapon',
    section: 'Fight Stunts',
    line: 2645,
    evidence: 'Backup Weapon.',
    changes:
      'Stunt rules condensed; character selections are companion builds. Backup Weapon uses the SRD fate-point cost.',
    visibility: 'shared',
  },
  {
    element: 'Tough as Nails',
    section: 'Physique Stunts',
    line: 2760,
    evidence: 'Tough as Nails.',
    changes: 'Stunt rule condensed; retains session limit, fate-point cost, and free mild-slot requirement.',
    visibility: 'shared',
  },
  {
    element: 'Danger Sense',
    section: 'Notice Stunts',
    line: 2730,
    evidence: 'Danger Sense.',
    changes: 'Stunt rule condensed; selection is a companion build.',
    visibility: 'shared',
  },
  {
    element: 'Always a Way Out; Talk the Talk',
    section: 'Burglary Stunts',
    line: 2429,
    evidence: 'Always a Way Out.',
    changes: 'Stunt rules condensed; selections are companion builds.',
    visibility: 'shared',
  },
  {
    element: 'I’ve Read about That!; Shield of Reason',
    section: 'Lore Stunts',
    line: 2707,
    evidence: 'Shield of Reason.',
    changes: 'Stunt rules condensed; selections are companion builds.',
    visibility: 'shared',
  },
  {
    element: 'Arcane Expert',
    section: 'Adding a Bonus to an Action',
    line: 1794,
    evidence: 'Arcane Expert.',
    changes: 'Stunt rule condensed; selection is a companion build.',
    visibility: 'shared',
  },
  {
    element: 'Collegia Arcana Magic',
    section: 'Extra: Collegia Arcana Magic',
    line: 5842,
    evidence: 'People who are trained in Collegia magic',
    changes:
      'Extra condensed into Zird’s sheet. As in the SRD example, the group waives an additional refresh charge.',
    visibility: 'shared',
  },
  {
    element: 'Opening scene and follow-up hooks',
    section: 'Faces and Places',
    line: 503,
    evidence: 'She isn’t cowed by Hugo’s extortion',
    changes:
      'Original companion scene based on Kale’s refusal of extortion. Questions and possible escalations are prompts, not SRD events or predetermined outcomes.',
    visibility: 'gm',
  },
];

const sourceUrl = (source: SampleSource) => `${sourceMetadata.sourceUrl}#L${source.line}`;
const sourceRegister = (visibility: SampleSource['visibility']) =>
  HEARTS_SOURCES.filter((source) => source.visibility === visibility)
    .map((source) => `${source.element}\n${source.changes}\n${source.section}: ${sourceUrl(source)}`)
    .join('\n\n');

function stunt(name: string, description: string, fateCost = 0, limit: Stunt['limit'] = 'none'): Stunt {
  return { id: id(), name, description, refreshCost: 1, fateCost, limit, uses: 0, maxUses: 1 };
}

/** Offline starter derived solely from the vendored CC-BY Core SRD and labeled companion additions. */
export async function heartsOfSteelCampaign() {
  const c = createCampaign('Hearts of Steel');
  c.tagline = 'Three troubleshooters. Two threats. A city that needs help.';
  c.setting =
    'A low-fantasy, vaguely medieval world of petty rulers and troubleshooters for hire. In Riverton, a trading city at two rivers, the Scar Triad makes its living through extortion while the Cult of Tranquility seeks to bring a terrible doom into the world.';
  c.scale = 'Town-to-town adventures with local stakes, beginning in Riverton.';
  c.issues = ['The Scar Triad', 'The Doom that Is to Come'].map((name) => createAspect('game', name));

  const pc = (name: string, description: string, aspects: string[], skills: string[], stunts: Stunt[]) => {
    const ch = createCharacter(c.rules, name);
    ch.description = description;
    ch.aspects = aspects.map((text, index) =>
      createAspect(index === 0 ? 'highConcept' : index === 1 ? 'trouble' : 'character', text, ch.id),
    );
    skills.forEach((skill, index) => {
      ch.skills[skill] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1][index];
    });
    ch.stunts = stunts;
    ch.creationMode = 'quick';
    ch.status = 'ready';
    ch.notes =
      'SRD-based starter adaptation. Skill allocations and stunt selections are explained in the journal’s “Hearts of Steel — sources and credits” entry. Backstory phases may be expanded together during play. Stunt effects and magical permissions require table adjudication.';
    return ch;
  };
  const landon = pc(
    'Landon',
    'A rough-mannered swordsman trained in the mysterious martial arts of the Ivory Shroud. Old Finn saved his life after a beating by Scar Triad thugs and encouraged him to join the militia. Cynere offered to help recover the sword they stole.',
    [
      'Disciple of the Ivory Shroud',
      'The Manners of a Goat',
      'I Owe Old Finn Everything',
      'Smashing Is Always an Option',
      'An Eye for an Eye',
    ],
    ['fight', 'physique', 'rapport', 'athletics', 'provoke', 'notice', 'crafts', 'shoot', 'stealth', 'will'],
    [
      stunt(
        'Heavy Hitter',
        'When you succeed with style on a Fight attack and reduce the result by one for a boost, gain a full situation aspect with a free invocation instead.',
      ),
      stunt(
        'Backup Weapon',
        'When an opponent would inflict Disarmed or a similar situation aspect, spend a fate point to reveal a backup weapon. The opponent gains a boost instead.',
        1,
      ),
      stunt(
        'Tough as Nails',
        'Once per session, spend a fate point to reduce a moderate physical consequence to mild if the mild slot is free, or erase a mild physical consequence.',
        1,
        'session',
      ),
    ],
  );
  const cynere = pc(
    'Cynere',
    'A nimble, daring swordswoman with a weakness for treasure. She offered to help Landon recover his stolen sword. After briefly taking an artifact Zird was recovering from his rivals, she and Zird gained mutual respect.',
    [
      'Infamous Girl with Sword',
      'Tempted by Shiny Things',
      'A Sucker for a Sob Story',
      'I’ve Got Zird’s Back',
      'I choose my own contracts',
    ],
    [
      'athletics',
      'burglary',
      'fight',
      'physique',
      'notice',
      'stealth',
      'deceive',
      'empathy',
      'investigate',
      'resources',
    ],
    [
      stunt(
        'Danger Sense',
        'Notice is unimpeded by darkness, total concealment, or other sensory impairments when someone or something intends to harm you.',
      ),
      stunt('Always a Way Out', '+2 to Burglary when creating an advantage to escape from a location.'),
      stunt(
        'Talk the Talk',
        'Use Burglary in place of Contacts when dealing specifically with thieves and burglars.',
      ),
    ],
  );
  cynere.notes += '\n\n“I choose my own contracts” is an original companion aspect.';
  const zird = pc(
    'Zird the Arcane',
    'A bookish wizard for hire with rivals in the Collegia Arcana. He recovered a magical artifact from those rivals and returned it to its rightful place, despite Cynere briefly taking it for herself.',
    [
      'Wizard for Hire',
      'Rivals in the Collegia Arcana',
      'If I Haven’t Been There, I’ve Read About It',
      'Not the Face!',
      'Answers before payment',
    ],
    [
      'lore',
      'crafts',
      'rapport',
      'athletics',
      'will',
      'investigate',
      'fight',
      'resources',
      'contacts',
      'notice',
    ],
    [
      stunt(
        'I’ve Read about That!',
        'Spend a fate point to use Lore in place of another skill for one roll or exchange, if you can justify having read about the action.',
        1,
      ),
      stunt(
        'Shield of Reason',
        'Use Lore to defend against Provoke when rational thought and reason can overcome your fear.',
      ),
      stunt(
        'Arcane Expert',
        '+2 to create an advantage with Lore when the situation specifically concerns the supernatural or occult.',
      ),
    ],
  );
  zird.notes += '\n\n“Answers before payment” is an original companion aspect.';
  zird.extras =
    'Collegia Arcana Magic\nPermission: an aspect reflecting Collegia training. Cost: Lore ranks; this example follows the SRD group’s waiver of an additional refresh charge.\n\nUse Lore to perform rituals or understand arcane phenomena; create magical mental or physical impediments (defended with Will); attack with magic (defended with Athletics or Will as appropriate, or Lore for a trained magician); and defend against hostile magic. Agree on fictional permissions and defenses with the GM. These effects are adjudicated at the table.';
  const npc = (name: string, aspect: string, description: string, skills: Character['skills']) => {
    const ch = createCharacter(c.rules, name, 'supporting');
    ch.aspects = [createAspect('highConcept', aspect, ch.id)];
    ch.description = description;
    ch.skills = skills;
    ch.status = 'ready';
    ch.notes =
      'Name, role, and aspect or backstory come from the SRD; skills are original companion allocations for this starter. See the journal’s sources and credits.';
    return ch;
  };
  c.characters = [
    landon,
    cynere,
    zird,
    npc(
      'Hugo the Charitable',
      'Everyone in Riverton Fears Me',
      'A lieutenant in the Scar Triad, connected to the campaign’s extortion problem.',
      { provoke: 3, contacts: 2, fight: 1, will: 1 },
    ),
    npc(
      'Kale Westal',
      'Stubborn Because I’m Right',
      'A Riverton shopkeeper who refuses to submit to Hugo’s extortion.',
      { will: 3, rapport: 2, empathy: 1, resources: 1 },
    ),
    npc(
      'Old Finn',
      'Landon’s mentor',
      'The veteran soldier who saved Landon’s life and encouraged him to join the militia. The mentor aspect is companion wording.',
      { fight: 3, physique: 2, notice: 1, will: 1 },
    ),
  ];

  const entry = (
    kind: WorldEntry['kind'],
    title: string,
    body: string,
    visibility: WorldEntry['visibility'] = 'shared',
    tags: string[] = [],
  ) => ({ id: id(), kind, title, body, visibility, tags });
  c.world = [
    entry(
      'location',
      'Riverton',
      'A trading city at two rivers. Hugo the Charitable is a Scar Triad lieutenant here, and shopkeeper Kale Westal refuses his extortion.\n\nThe bundled Riverton map is an original companion interpretation, revised to match the overview banner’s riverfront, stone quays, eastern bridge, and merchant quarter. Its street layout, Market Square, Old Bridge, and placement of Kale’s shop are companion additions, not official SRD geography. Adapt districts and routes together during play.',
      'shared',
      ['home', 'trade'],
    ),
    entry(
      'faction',
      'The Scar Triad',
      'A criminal organization involved in theft, extortion, and racketeering. Hugo the Charitable is its Riverton lieutenant. Landon has already suffered at the hands of its thugs.',
      'shared',
      ['current issue'],
    ),
    entry(
      'faction',
      'The Cult of Tranquility',
      'A cult seeking to summon something terrible into the world. Its branches disagree over Two Conflicting Prophecies. Its leader is known as the Primarch; their identity remains a mystery.',
      'shared',
      ['impending issue'],
    ),
    entry(
      'faction',
      'The Ivory Shroud',
      'Landon trained in this mysterious martial-arts organization. Its techniques suggest rival schools and people who want its secrets. Decide those details when they enter play.',
      'shared',
      ['Landon'],
    ),
    entry(
      'faction',
      'The Collegia Arcana',
      'Zird’s magical training connects him to this organization, where he has rivals. His earlier adventure involved recovering an artifact from those rivals and returning it to its rightful place.',
      'shared',
      ['Zird'],
    ),
    entry(
      'note',
      'People and connections',
      'Hugo the Charitable — Scar Triad lieutenant. Aspect: Everyone in Riverton Fears Me.\n\nKale Westal — shopkeeper who resists his extortion. Aspect: Stubborn Because I’m Right.\n\nOld Finn — the veteran who saved Landon and set him on the path to the militia.',
      'shared',
      ['faces'],
    ),
    entry(
      'summary',
      'The party’s shared past',
      'Landon was beaten and robbed of his sword by Scar Triad thugs. Old Finn helped him recover and join the militia. Cynere offered to help steal the sword back.\n\nZird recovered a magical artifact from his Collegia rivals. Cynere briefly took it, but it returned to Zird and the two gained mutual respect.\n\nDiscuss what brought the three troubleshooters to Riverton together. This starter leaves that answer to the table.',
      'shared',
      ['backstory'],
    ),
    entry(
      'note',
      'Opening: a favor for Kale',
      'Original companion opening, adapted from the SRD’s threatened shopkeeper.\n\nBegin in Kale’s shop as she refuses another demand for protection money. She asks the troubleshooters to stay until closing. Ask Landon what he recognizes about the collectors, Cynere what makes the shop worth protecting, and Zird what question brought him to Riverton. Let the players supply the answers.\n\nCan the party keep Kale safe without leaving her with an even worse problem? What does Hugo do if his authority is challenged? Play the collectors as a small nameless group built for the table; Hugo does not have to appear immediately.\n\nEscalation options: negotiation, gathering support among merchants, exposing the extortion, or a confrontation. Treat failure as a new complication. Do not predetermine Kale’s fate.',
      'gm',
      ['opening', 'companion adaptation'],
    ),
    entry(
      'note',
      'Future threads',
      'Original companion prompts using the SRD’s factions.\n\nAfter the extortion dispute, introduce conflicting accounts of a prophecy. Ask whether either account is trustworthy before deciding what the cult is doing locally. There is no established connection between Hugo and the cult in this starter.\n\nKeep the Primarch’s identity and the meaning of the doom open. Invite discoveries through play. Zird’s rivals and Landon’s obligations to Old Finn can bring the party back to these questions. Later rulebook examples are possibilities, not events that have already happened here.',
      'gm',
      ['preparation', 'companion adaptation'],
    ),
    entry(
      'reference',
      'Hearts of Steel — sources and credits',
      `©2013 Evil Hat Productions, LLC.\n\n${sourceMetadata.attribution}\n\nCreative Commons Attribution 3.0 Unported: ${sourceMetadata.licenseUrl}\n\nThis independent starter adapts the official Fate Core SRD. Descriptions and stunt text are condensed. Character builds, two additional PC aspects (“I choose my own contracts” and “Answers before payment”), Old Finn’s “Landon’s mentor” aspect, and the opening prompts are companion adaptations or original additions. They are not official character sheets. No supplement text or artwork is included.\n\nSource revision: ${sourceMetadata.revision}\n\n${sourceRegister('shared')}`,
      'shared',
      ['sources', 'CC BY 3.0'],
    ),
    entry('reference', 'Opening — source and adaptation notes', sourceRegister('gm'), 'gm', ['sources']),
  ];
  c.play.scenarioName = 'A favor for Kale';
  c.play.sceneName = 'Kale’s shop';
  c.play.npcFatePoints = 3;
  const { asset, map } = await loadRivertonMap();
  c.assets.push(asset);
  c.maps.push(map);
  return c;
}
