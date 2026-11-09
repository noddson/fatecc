import notice from '../content/LICENSE.txt?raw';
import { Modal } from '../ui';
import './RulesAttribution.css';

const paragraphs = notice
  .trim()
  .split(/\n\s*\n/)
  .slice(1);
export const logoCredit = paragraphs.find((text) => text.startsWith('Fate™'))!;
export const fontCredit = paragraphs.find((text) => text.startsWith('The Fate Core font is'))!;

function LinkedText({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s)]+)/).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function RulesAttribution({ close }: { close: () => void }) {
  return (
    <Modal title="Rules Attribution" close={close} wide>
      <div className="rules-attribution">
        <p className="attribution-intro">
          Fate Core Companion is an independent companion. The rules, logo, and symbols are used with credit
          to their creators.
        </p>
        <section className="attribution-credits" aria-label="Logo and font credits">
          <div>
            <img
              src={`${import.meta.env.BASE_URL}branding/powered-by-fate-light.svg`}
              alt="Powered by Fate"
            />
            <p>{logoCredit}</p>
          </div>
          <div>
            <h3>Fate Core font</h3>
            <p>{fontCredit}</p>
          </div>
        </section>
        <section>
          <h3>Rules, sources & licenses</h3>
          {paragraphs
            .filter((text) => text !== logoCredit && text !== fontCredit)
            .map((text) => (
              <p key={text} className="attribution-paragraph">
                <LinkedText text={text} />
              </p>
            ))}
        </section>
        <div className="attribution-links">
          <a href="https://fate-srd.com/official-licensing-fate" target="_blank" rel="noreferrer">
            Official Fate licensing
          </a>
          <a href={`${import.meta.env.BASE_URL}LICENSE-SRD.txt`} target="_blank" rel="noreferrer">
            Plain-text notice
          </a>
        </div>
      </div>
    </Modal>
  );
}
