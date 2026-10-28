import { BadRequestException, Logger } from '@nestjs/common';
import { CycleProposalInput } from './proposal-provider-model';
import { buildSystemPrompt } from './proposal-prompts';
import { generateSafeProposal, unsafeTrainingTerm } from './training-safety';

const input = {
  userId: 'user-1',
  area: { id: 'tecnica', name: 'Tecnica' },
  context: { guidance: {} },
} as unknown as CycleProposalInput;

const proposal = (body: string, cue = 'Busto stabile.') => ({
  provider: 'gemini',
  model: 'test',
  summaryText: 'Finestra di 14 giorni',
  planItems: [
    {
      title: 'Allenamento 1',
      body,
      content: { exercises: [{ name: 'Affondi', cue }] },
    },
  ],
  questions: [{ text: 'Come è andata?' }],
});

type Proposal = ReturnType<typeof proposal>;
const mockGenerate = () => jest.fn<Promise<Proposal>, [CycleProposalInput]>();

describe('training safety', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation());

  it('finds a banned term anywhere in the texts the athlete sees', () => {
    expect(
      unsafeTrainingTerm(
        proposal('Riscaldamento.', 'Spingi fino a cedimento.'),
        ['cedimento'],
      ),
    ).toBe('cedimento');
    expect(
      unsafeTrainingTerm(proposal('Ritmo non massimale.'), ['massimal']),
    ).toBeNull();
    expect(unsafeTrainingTerm(proposal('Sprint finali.'), [])).toBeNull();
  });

  it('makes a single call and no check when the list is empty', async () => {
    const generate = mockGenerate().mockResolvedValue(
      proposal('Sprint finali.'),
    );
    await expect(
      generateSafeProposal(new Logger('test'), input, [], generate),
    ).resolves.toMatchObject({ summaryText: 'Finestra di 14 giorni' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).not.toHaveProperty('unsafeTerms');
  });

  it('rewrites once, telling the AI which term was rejected', async () => {
    const generate = mockGenerate()
      .mockResolvedValueOnce(proposal('Sprint finali.'))
      .mockResolvedValueOnce(proposal('Corsa leggera.'));
    const ok = await generateSafeProposal(
      new Logger('test'),
      input,
      ['sprint'],
      generate,
    );
    expect(ok.planItems[0].body).toBe('Corsa leggera.');
    expect(generate.mock.calls[0][0]).toMatchObject({
      unsafeTerms: ['sprint'],
    });
    expect(generate.mock.calls[1][0]).toMatchObject({ rejectedTerm: 'sprint' });
  });

  it('gives up after the second rejected attempt', async () => {
    const generate = mockGenerate().mockResolvedValue(
      proposal('Sprint finali.'),
    );
    await expect(
      generateSafeProposal(new Logger('test'), input, ['sprint'], generate),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('puts the banned terms and the rejected one in the system prompt', () => {
    expect(buildSystemPrompt(input)).not.toContain('Contenuti vietati');
    const prompt = buildSystemPrompt({
      ...input,
      unsafeTerms: ['sprint', 'cedimento'],
      rejectedTerm: 'sprint',
    });
    expect(prompt).toContain('sprint, cedimento');
    expect(prompt).toContain('conteneva «sprint»');
  });
});
