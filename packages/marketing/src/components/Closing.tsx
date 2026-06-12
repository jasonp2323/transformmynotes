import Button from './ui/Button';

const SIGNUP = 'https://app.transformmynotes.com/request-access';
const LOGIN = 'https://app.transformmynotes.com/login';

export default function Closing() {
  return (
    <section className="closing-wrap">
      <div className="container">
        <div className="closing" data-reveal>
          <div className="closing__bar" aria-hidden="true"></div>
          <h2 className="closing__title">Request access</h2>
          <p className="closing__note">
            Access is invite-gated. Request a spot and we&apos;ll be in touch. Already a member? Sign in.
          </p>
          <div className="closing__cta">
            <Button as="a" href={SIGNUP} variant="primary" size="lg">Request access</Button>
            <Button as="a" href={LOGIN} variant="secondary" size="lg">Sign in</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
