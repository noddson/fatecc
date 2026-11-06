import { test, expect } from '@playwright/test';

test('real peer table approves, filters secrets, rejects forged authority, deduplicates, and reconnects', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const gmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();
  await Promise.all([gm.goto('./'), player.goto('./')]);
  await gm.evaluate(async () => {
    const net = await import('/src/network/peer.ts');
    const defaults = await import('/src/domain/defaults.ts');
    const domain = await import('/src/domain/commands.ts');
    const { saveInventoryItem } = await import('/src/domain/inventory.ts');
    const { createAsset } = await import('/src/storage/assets.ts');
    const state = window as any;
    state.campaign = defaults.createCampaign('Network acceptance');
    const hero = defaults.createCharacter(state.campaign.rules, 'Player hero');
    hero.id = 'hero';
    hero.skills = { fight: 4 };
    const npc = defaults.createCharacter(state.campaign.rules, 'SECRET ADVERSARY', 'main');
    npc.id = 'private-npc';
    state.campaign.characters = [hero, npc];
    for (const [ownerId, name] of [
      ['hero', 'PERSONAL RELIC'],
      ['private-npc', 'SECRET NPC RELIC'],
    ]) {
      saveInventoryItem(state.campaign, {
        id: `relic-${ownerId}`,
        revision: 0,
        name,
        quantity: 1,
        unit: 'item',
        ownerId,
        description: `${name} details`,
        visibility: 'character',
      });
    }
    state.campaign.world.push({
      id: 'private-note',
      kind: 'note',
      title: 'SECRET PLOT',
      body: 'Undisclosed',
      visibility: 'gm',
      tags: [],
    });
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(128, 128);
    pixels.data.set(crypto.getRandomValues(new Uint8Array(pixels.data.length)));
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
    const asset = await createAsset(new File([blob], 'Shared map.png', { type: 'image/png' }), 'shared');
    state.campaign.assets = [asset, { ...asset, id: 'secret-image', name: 'SECRET IMAGE', visibility: 'gm' }];
    state.campaign.world.push({
      id: 'public-image',
      kind: 'note',
      title: 'Shared image',
      body: 'Image transfer fixture',
      visibility: 'shared',
      tags: [],
      assetId: asset.id,
    });
    state.joins = [];
    state.networkErrors = [];
    state.host = new net.FatePeerHost({
      getCampaign: () => state.campaign,
      onCommand: async (command: unknown, actor: unknown) => {
        state.campaign = domain.applyCommand(state.campaign, command, actor);
        return state.campaign;
      },
      onPendingJoin: (joins: unknown) => {
        state.joins = joins;
      },
      onGrant: async (grant: any) => {
        state.campaign = domain.applyCommand(
          state.campaign,
          {
            id: crypto.randomUUID(),
            type: 'assignPlayer',
            memberId: grant.memberId,
            name: grant.name,
            characterIds: grant.characterIds,
          },
          { id: 'gm', role: 'gm', characterIds: [] },
        );
      },
      onError: (error: unknown) => state.networkErrors.push(error),
    });
  });
  const invitation = await gm.evaluate(async () => (window as any).host.createOffer());
  const answer = await player.evaluate(async (offer: string) => {
    const { FatePeerClient } = await import('/src/network/peer.ts');
    const state = window as any;
    state.received = undefined;
    state.status = '';
    state.networkErrors = [];
    state.client = new FatePeerClient({
      name: 'Remote player',
      onCampaign: (campaign: unknown) => {
        state.received = campaign;
      },
      onStatus: (status: string) => {
        state.status = status;
      },
      onError: (error: string) => state.networkErrors.push(error),
    });
    return state.client.acceptOffer(offer);
  }, invitation.offer);
  await gm.evaluate(async ({ peerId, answer }) => (window as any).host.acceptAnswer(peerId, answer), {
    peerId: invitation.peerId,
    answer,
  });
  try {
    await expect.poll(() => gm.evaluate(() => (window as any).joins.length)).toBe(1);
  } catch (error) {
    const diagnostics = {
      host: await gm.evaluate(() => ({
        peers: (window as any).host.peerList,
        errors: (window as any).networkErrors,
        states: [...(window as any).host.peers.values()].map((p: any) => ({
          ice: p.pc.iceConnectionState,
          gathering: p.pc.iceGatheringState,
          localCandidates: (p.pc.localDescription?.sdp.match(/a=candidate:/g) || []).length,
          remoteCandidates: (p.pc.remoteDescription?.sdp.match(/a=candidate:/g) || []).length,
          control: p.control.channel.readyState,
          assets: p.assets.channel.readyState,
        })),
      })),
      player: await player.evaluate(() => ({
        status: (window as any).status,
        errors: (window as any).networkErrors,
        ice: (window as any).client.pc?.iceConnectionState,
        localCandidates: ((window as any).client.pc?.localDescription?.sdp.match(/a=candidate:/g) || [])
          .length,
        remoteCandidates: ((window as any).client.pc?.remoteDescription?.sdp.match(/a=candidate:/g) || [])
          .length,
        control: (window as any).client.control?.channel.readyState,
      })),
    };
    console.error(JSON.stringify(diagnostics, null, 2));
    await test.info().attach('network-state', {
      contentType: 'application/json',
      body: JSON.stringify(diagnostics, null, 2),
    });
    throw error;
  }
  await expect.poll(() => player.evaluate(() => (window as any).received === undefined)).toBe(true);
  await gm.evaluate(
    async (peerId: string) => (window as any).host.approve(peerId, 'Remote player', ['hero']),
    invitation.peerId,
  );
  await expect.poll(() => player.evaluate(() => (window as any).received?.characters.length)).toBe(1);
  await expect.poll(() => player.evaluate(() => (window as any).received?.assets.length)).toBe(1);
  expect(await player.evaluate(() => (window as any).received.assets[0].hash)).toBe(
    await gm.evaluate(() => (window as any).campaign.assets[0].hash),
  );
  expect(await player.evaluate(() => (window as any).received.assets[0].dataUrl.length)).toBeGreaterThan(
    12_000,
  );
  expect(await player.evaluate(() => JSON.stringify((window as any).received))).not.toContain('SECRET');
  expect(
    await player.evaluate(() => (window as any).received.inventory.map((item: any) => item.name)),
  ).toEqual(['PERSONAL RELIC']);
  expect(
    await player.evaluate(() =>
      (window as any).received.events.filter((event: any) => event.type === 'inventory'),
    ),
  ).toEqual([
    expect.objectContaining({
      visibility: 'character',
      characterId: 'hero',
      summary: expect.stringContaining('PERSONAL RELIC'),
    }),
  ]);
  await expect.poll(() => player.evaluate(() => (window as any).client.connected)).toBe(true);

  // A forged actor/role in the payload does not override the actor bound to the approved connection.
  const forged = await player.evaluate(async () => {
    try {
      await (window as any).client.sendCommand({
        id: 'forged-gm',
        type: 'adjustFate',
        characterId: 'hero',
        amount: 100,
        reason: 'Cheat',
        actorId: 'gm',
        role: 'gm',
      });
      return 'accepted';
    } catch {
      return 'rejected';
    }
  });
  expect(forged).toBe('rejected');
  expect(await gm.evaluate(() => (window as any).campaign.characters[0].fatePoints)).toBe(3);

  const roll = {
    id: 'one-stable-roll',
    type: 'roll',
    characterId: 'hero',
    action: 'overcome',
    skillId: 'fight',
    opposition: 2,
  };
  await player.evaluate(async (command) => (window as any).client.sendCommand(command), roll);
  await player.evaluate(async (command) => (window as any).client.sendCommand(command), roll);
  await expect
    .poll(() =>
      gm.evaluate(
        () => (window as any).campaign.events.filter((e: any) => e.commandId === 'one-stable-roll').length,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      player.evaluate(
        () => (window as any).received.events.filter((e: any) => e.commandId === 'one-stable-roll').length,
      ),
    )
    .toBe(1);

  // Close the player connection, retain its local pairing, then establish a fresh peer connection.
  await player.evaluate(() => (window as any).client.close());
  await expect
    .poll(() => gm.evaluate(() => (window as any).host.peerList.some((p: any) => p.status !== 'connected')), {
      timeout: 5000,
    })
    .toBe(true);
  // A fresh snapshot must restore the owner's private inventory changes made while disconnected.
  await gm.evaluate(async () => {
    const { saveInventoryItem } = await import('/src/domain/inventory.ts');
    const state = window as any;
    saveInventoryItem(state.campaign, { ...state.campaign.inventory[0], quantity: 2 });
  });
  const reconnect = await gm.evaluate(async () => (window as any).host.createOffer());
  const reconnectAnswer = await player.evaluate(
    async (offer) => (window as any).client.acceptOffer(offer),
    reconnect.offer,
  );
  await gm.evaluate(async ({ peerId, answer }) => (window as any).host.acceptAnswer(peerId, answer), {
    peerId: reconnect.peerId,
    answer: reconnectAnswer,
  });
  await expect.poll(() => player.evaluate(() => (window as any).client.connected)).toBe(true);
  expect(await gm.evaluate(() => (window as any).joins.length)).toBe(0);
  expect(
    await player.evaluate(
      () => (window as any).received.events.filter((e: any) => e.commandId === 'one-stable-roll').length,
    ),
  ).toBe(1);
  await expect.poll(() => player.evaluate(() => (window as any).received.inventory[0]?.quantity)).toBe(2);
  expect(
    await player.evaluate(() =>
      (window as any).received.events
        .filter((event: any) => event.type === 'inventory')
        .map((event: any) => event.visibility),
    ),
  ).toEqual(['character', 'character']);

  const memberId = await player.evaluate(() => (window as any).client.actor.id);
  await gm.evaluate((id) => (window as any).host.revoke(id), memberId);
  await expect.poll(() => player.evaluate(() => (window as any).client.connected)).toBe(false);
  await gm.evaluate(async () => {
    const { saveInventoryItem } = await import('/src/domain/inventory.ts');
    const state = window as any;
    saveInventoryItem(state.campaign, { ...state.campaign.inventory[0], quantity: 3 });
    await state.host.broadcast();
  });
  // Previously received information remains cached; revoked clients receive no subsequent changes.
  expect(await player.evaluate(() => (window as any).received.inventory[0].quantity)).toBe(2);
  await gm.evaluate(() => (window as any).host.close());
  await Promise.all([gmContext.close(), playerContext.close()]);
});

test('one GM and seven players converge on the same accepted roll history', async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 8 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [gm, ...players] = pages;
  try {
    await Promise.all(pages.map((page) => page.goto('./')));
    await gm.evaluate(async () => {
      const { FatePeerHost } = await import('/src/network/peer.ts');
      const { createCampaign, createCharacter } = await import('/src/domain/defaults.ts');
      const { applyCommand } = await import('/src/domain/commands.ts');
      const { saveInventoryItem } = await import('/src/domain/inventory.ts');
      const state = window as any;
      state.campaign = createCampaign('Full table');
      state.campaign.characters = Array.from({ length: 7 }, (_, i) => {
        const c = createCharacter(state.campaign.rules, `Hero ${i + 1}`);
        c.id = `hero-${i}`;
        c.skills = { lore: 3 };
        return c;
      });
      for (let index = 0; index < 7; index++) {
        saveInventoryItem(state.campaign, {
          id: `private-item-${index}`,
          revision: 0,
          name: `PRIVATE POSSESSION ${index}`,
          quantity: 1,
          unit: 'item',
          ownerId: `hero-${index}`,
          description: `Private information for hero ${index}`,
          visibility: 'character',
        });
      }
      state.joins = [];
      state.host = new FatePeerHost({
        getCampaign: () => state.campaign,
        onCommand: async (command: unknown, actor: unknown) => {
          state.campaign = applyCommand(state.campaign, command, actor);
          return state.campaign;
        },
        onPendingJoin: (joins: unknown) => {
          state.joins = joins;
        },
        onGrant: async (grant: any) => {
          state.campaign = applyCommand(
            state.campaign,
            {
              id: crypto.randomUUID(),
              type: 'assignPlayer',
              memberId: grant.memberId,
              name: grant.name,
              characterIds: grant.characterIds,
            },
            { id: 'gm', role: 'gm', characterIds: [] },
          );
        },
      });
    });
    for (const [index, player] of players.entries()) {
      const offer = await gm.evaluate(async () => (window as any).host.createOffer());
      const answer = await player.evaluate(
        async ({ offer, index }) => {
          const { FatePeerClient } = await import('/src/network/peer.ts');
          const state = window as any;
          state.client = new FatePeerClient({
            name: `Player ${index + 1}`,
            onCampaign: (campaign: unknown) => {
              state.received = campaign;
            },
          });
          return state.client.acceptOffer(offer);
        },
        { offer: offer.offer, index },
      );
      await gm.evaluate(async ({ peerId, answer }) => (window as any).host.acceptAnswer(peerId, answer), {
        peerId: offer.peerId,
        answer,
      });
      await expect
        .poll(() =>
          gm.evaluate(
            (peerId) => (window as any).joins.some((join: any) => join.peerId === peerId),
            offer.peerId,
          ),
        )
        .toBe(true);
      await gm.evaluate(
        async ({ peerId, index }) =>
          (window as any).host.approve(peerId, `Player ${index + 1}`, [`hero-${index}`]),
        { peerId: offer.peerId, index },
      );
      await expect.poll(() => player.evaluate(() => (window as any).client.connected)).toBe(true);
      await expect
        .poll(() => player.evaluate(() => (window as any).received?.inventory.map((item: any) => item.id)))
        .toEqual([`private-item-${index}`]);
      expect(
        await player.evaluate(() =>
          (window as any).received.events.filter((event: any) => event.type === 'inventory'),
        ),
      ).toEqual([
        expect.objectContaining({
          visibility: 'character',
          characterId: `hero-${index}`,
          summary: expect.stringContaining(`PRIVATE POSSESSION ${index}`),
        }),
      ]);
    }
    const overCapacity = await gm.evaluate(async () => {
      try {
        await (window as any).host.createOffer();
        return false;
      } catch {
        return true;
      }
    });
    expect(overCapacity).toBe(true);
    await Promise.all(
      players.map((player, index) =>
        player.evaluate(async (i) => {
          await (window as any).client.sendCommand({
            id: `full-table-roll-${i}`,
            type: 'roll',
            characterId: `hero-${i}`,
            action: 'overcome',
            skillId: 'lore',
            opposition: 2,
          });
        }, index),
      ),
    );
    await expect
      .poll(() =>
        gm.evaluate(
          () => (window as any).campaign.events.filter((event: any) => event.type === 'roll').length,
        ),
      )
      .toBe(7);
    for (const player of players)
      await expect
        .poll(() =>
          player.evaluate(
            () => (window as any).received?.events.filter((event: any) => event.type === 'roll').length,
          ),
        )
        .toBe(7);
    const hostRolls = await gm.evaluate(() =>
      (window as any).campaign.events
        .filter((event: any) => event.type === 'roll')
        .map((event: any) => ({ id: event.roll.id, dice: event.roll.dice, total: event.roll.total })),
    );
    for (const player of players)
      expect(
        await player.evaluate(() =>
          (window as any).received.events
            .filter((event: any) => event.type === 'roll')
            .map((event: any) => ({ id: event.roll.id, dice: event.roll.dice, total: event.roll.total })),
        ),
      ).toEqual(hostRolls);
    await gm.evaluate(() => (window as any).host.close());
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
