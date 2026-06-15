import type { Metadata } from 'next';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import RevealObserver from '../../src/components/Reveal';

export const metadata: Metadata = {
  title: 'Privacy Policy — TransformMyNotes',
  description:
    'Learn how TransformMyNotes collects, uses, and protects your personal data and note content.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    type: 'website',
    title: 'Privacy Policy — TransformMyNotes',
    description:
      'Learn how TransformMyNotes collects, uses, and protects your personal data and note content.',
    url: 'https://transformmynotes.com/privacy',
    siteName: 'TransformMyNotes',
  },
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        {/* ---- Page header ---- */}
        <section className="section-pad section-pad--sm">
          <div className="container">
            <span className="eyebrow" data-reveal>Legal</span>
            <h1 className="section-heading changelog-h1" data-reveal data-delay="1">
              Privacy Policy
            </h1>
            <p className="changelog-sub" data-reveal data-delay="2">
              Effective date: June 15, 2026
            </p>
          </div>
        </section>

        {/* ---- Policy content ---- */}
        <section className="section-pad section-pad--sm">
          <div className="container">
            <div className="changelog-entry__body" data-reveal>
              <h3>Introduction &amp; scope</h3>
              <p>
                This Privacy Policy describes how TransformMyNotes (&ldquo;we&rdquo;,
                &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and safeguards
                information when you use our note-transcription service — including our
                web application at <strong>app.transformmynotes.com</strong> and our
                Android app. By using TransformMyNotes you agree to the practices
                described here. This policy applies to all users of the service regardless
                of how they access it.
              </p>

              <h3>Information we collect</h3>
              <p>We collect only what is necessary to provide the service:</p>
              <ul>
                <li>
                  <strong>Account information.</strong> When you create an account we
                  collect your email address. Authentication is handled through AWS
                  Cognito; we do not store your password directly.
                </li>
                <li>
                  <strong>Note images.</strong> When you capture or upload a photograph
                  of your handwritten notes, that image is transmitted to our servers
                  for processing.
                </li>
                <li>
                  <strong>Transcribed note content.</strong> The text extracted from your
                  images — the digital version of your notes — is stored so you can
                  access, search, and organise it later.
                </li>
                <li>
                  <strong>Basic usage data.</strong> Standard server logs (IP address,
                  browser/device type, pages visited) are collected automatically to
                  operate and secure the service.
                </li>
              </ul>

              <h3>How we use your information</h3>
              <p>We use the information we collect solely to:</p>
              <ul>
                <li>
                  Provide the core note-transcription feature — converting your
                  handwritten note images into searchable digital text.
                </li>
                <li>
                  Authenticate you and keep your account secure.
                </li>
                <li>
                  Store, organise, and surface your notes so you can access them across
                  devices.
                </li>
                <li>
                  Operate, maintain, and improve the reliability and quality of the
                  service.
                </li>
                <li>
                  Respond to support enquiries or account-related requests.
                </li>
              </ul>
              <p>
                We do not use your note content for advertising, do not build profiles
                for third-party marketing, and do not train machine-learning models on
                your personal data or note images.
              </p>

              <h3>Image processing</h3>
              <p>
                The core function of TransformMyNotes is optical character recognition
                (OCR) — converting photographs of handwritten notes into editable digital
                text. When you submit a note image, it is sent to <strong>AWS Bedrock</strong>,
                Amazon&rsquo;s managed AI infrastructure, which performs the transcription.
                AWS Bedrock processes the image solely to return the extracted text; it
                does not retain your images for model training under the standard AWS
                Bedrock service terms. The transcribed text is then stored in your account
                for your use.
              </p>

              <h3>Where your data is stored</h3>
              <p>
                All account data, note metadata, and transcribed note content are stored
                on <strong>Amazon Web Services (AWS)</strong> infrastructure. Authentication
                and account management are handled by <strong>AWS Cognito</strong>. Our
                infrastructure is operated in the United States. By using the service you
                consent to your data being processed and stored in the US.
              </p>

              <h3>Camera &amp; photo permissions (Android app)</h3>
              <p>
                The TransformMyNotes Android app requests access to your device&rsquo;s
                camera and/or photo library <strong>solely</strong> to allow you to
                capture or select images of your handwritten notes for transcription.
                We do not access, scan, or store any other photos on your device. Camera
                and photo access is used only in direct response to your explicit action
                of initiating a note capture. You can revoke these permissions at any
                time through your device&rsquo;s settings; doing so will prevent you
                from uploading new note images but will not affect notes already saved
                in your account.
              </p>

              <h3>Data sharing</h3>
              <p>
                We do <strong>not</strong> sell your personal data or note content to
                any third party, ever. We share data only as strictly necessary to
                operate the service:
              </p>
              <ul>
                <li>
                  <strong>AWS (infrastructure subprocessor).</strong> Amazon Web Services
                  hosts our application, stores data (DynamoDB, S3), processes images
                  (Bedrock), and manages authentication (Cognito). AWS acts as a data
                  processor on our behalf and is contractually bound to handle your data
                  only as we direct.
                </li>
                <li>
                  <strong>Legal requirements.</strong> We may disclose information if
                  required to do so by law or in response to valid legal process (such
                  as a court order or subpoena).
                </li>
              </ul>

              <h3>Data retention &amp; deletion</h3>
              <p>
                Your notes and account data are retained for as long as your account
                remains active. If you wish to delete your account and all associated
                data — including all stored note images and transcriptions — please
                contact us at the email address below. We will process deletion requests
                within a reasonable timeframe. Please note that some residual data may
                remain in encrypted backups for a short period before being purged
                automatically.
              </p>

              <h3>Security</h3>
              <p>
                We take reasonable technical and organisational measures to protect your
                data against unauthorised access, loss, or disclosure. These measures
                include encrypted data transmission (HTTPS/TLS), authentication via AWS
                Cognito with JWT-based session tokens, and access controls on our cloud
                infrastructure. No method of transmission or storage over the internet
                is completely secure, and we cannot guarantee absolute security; however,
                we are committed to protecting your data using industry-standard
                practices.
              </p>

              <h3>Children&rsquo;s privacy</h3>
              <p>
                TransformMyNotes is not directed at children under the age of 13. We do
                not knowingly collect personal information from children under 13. If
                you believe a child under 13 has provided us with personal information,
                please contact us and we will delete it promptly.
              </p>

              <h3>Changes to this policy</h3>
              <p>
                We may update this Privacy Policy from time to time. When we do, we will
                revise the effective date at the top of this page. We encourage you to
                review this page periodically. Continued use of the service after changes
                are posted constitutes your acceptance of the updated policy.
              </p>

              <h3>Contact us</h3>
              <p>
                If you have any questions about this Privacy Policy, want to request
                access to or deletion of your data, or have any other privacy-related
                concerns, please contact us at:{' '}
                <a href="mailto:jpaquette2323@gmail.com">jpaquette2323@gmail.com</a>.
              </p>
            </div>
          </div>
        </section>

        <RevealObserver />
      </main>
      <Footer />
    </>
  );
}
