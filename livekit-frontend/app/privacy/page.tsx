import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        <Link 
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="mr-2"
          >
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back to Home
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
          Privacy Policy
        </h1>

        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            <strong>Last Updated:</strong> February 2, 2026
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">1. Introduction</h2>
            <p className="text-foreground/90 leading-relaxed">
              Welcome to the Haaga-Helia AI Voice Assistant. This privacy policy explains how we collect, use, 
              and protect your personal data when you use our voice assistant service. This service is operated 
              by Haaga-Helia University of Applied Sciences and complies with the EU General Data Protection 
              Regulation (GDPR) and Finnish data protection legislation.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">2. Data Controller</h2>
            <p className="text-foreground/90 leading-relaxed">
              Haaga-Helia University of Applied Sciences<br />
              Ratapihantie 13, 00520 Helsinki, Finland<br />
              Business ID: 2088212-5
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">3. What Data We Collect</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              When you use the Haaga-Helia AI Voice Assistant, we may collect the following information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Voice Data:</strong> Audio recordings of your voice conversations with the AI assistant</li>
              <li><strong>Conversation Transcripts:</strong> Text transcriptions of your voice interactions</li>
              <li><strong>Session Information:</strong> Date, time, and duration of conversations</li>
              <li><strong>Technical Data:</strong> IP address (anonymized), browser type, device information</li>
              <li><strong>Usage Analytics:</strong> Aggregated data about service usage and interaction patterns</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">4. Legal Basis for Processing</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              We process your personal data based on:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Consent (Article 6(1)(a) GDPR):</strong> You provide explicit consent when you start using the voice assistant</li>
              <li><strong>Legitimate Interest (Article 6(1)(f) GDPR):</strong> To improve our services and provide better support to students</li>
              <li><strong>Legal Obligation (Article 6(1)(c) GDPR):</strong> When required to comply with applicable laws</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">5. Purpose of Data Processing</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              We use your data for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>Providing real-time AI voice assistance to students</li>
              <li>Improving the accuracy and quality of our AI responses</li>
              <li>Analyzing service usage to enhance user experience</li>
              <li>Training and improving our AI models</li>
              <li>Ensuring service security and preventing abuse</li>
              <li>Complying with legal and regulatory requirements</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">6. Call Recording Notice</h2>
            <p className="text-foreground/90 leading-relaxed">
              <strong>Your voice conversations may be recorded.</strong> By using this service, you acknowledge and 
              consent to the recording of your voice interactions. These recordings are used solely for service 
              improvement, quality assurance, and AI training purposes. You have the right to withdraw your consent 
              at any time by discontinuing use of the service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">7. Data Sharing and Third Parties</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              We may share your data with the following third parties:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>LiveKit Cloud:</strong> Voice communication infrastructure (USA/EU, GDPR-compliant)</li>
              <li><strong>OpenAI/Anthropic/Google:</strong> AI language model providers (depending on configuration)</li>
              <li><strong>Supabase:</strong> Database and analytics hosting (EU-based, GDPR-compliant)</li>
            </ul>
            <p className="text-foreground/90 leading-relaxed mt-3">
              All third-party processors are contractually bound to GDPR compliance and data protection standards. 
              We ensure appropriate safeguards are in place when data is transferred outside the EU/EEA.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">8. Data Retention</h2>
            <p className="text-foreground/90 leading-relaxed">
              We retain your data for the following periods:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Voice Recordings:</strong> Up to 12 months, then automatically deleted</li>
              <li><strong>Conversation Transcripts:</strong> Up to 24 months for quality improvement</li>
              <li><strong>Analytics Data:</strong> Anonymized data may be retained indefinitely</li>
            </ul>
            <p className="text-foreground/90 leading-relaxed mt-3">
              After the retention period, all personal data is permanently deleted from our systems.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">9. Your Rights Under GDPR</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              You have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Right to Access:</strong> Request a copy of your personal data</li>
              <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
              <li><strong>Right to Erasure:</strong> Request deletion of your data ("right to be forgotten")</li>
              <li><strong>Right to Restriction:</strong> Limit how we use your data</li>
              <li><strong>Right to Data Portability:</strong> Receive your data in a machine-readable format</li>
              <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time</li>
            </ul>
            <p className="text-foreground/90 leading-relaxed mt-3">
              To exercise any of these rights, please contact us using the information provided below.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">10. Data Security</h2>
            <p className="text-foreground/90 leading-relaxed">
              We implement appropriate technical and organizational measures to protect your personal data against 
              unauthorized access, alteration, disclosure, or destruction. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>End-to-end encryption for voice communications</li>
              <li>Secure data storage with encryption at rest</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls and authentication mechanisms</li>
              <li>Staff training on data protection and privacy</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">11. Cookies and Tracking</h2>
            <p className="text-foreground/90 leading-relaxed">
              We use essential cookies and similar technologies to ensure the proper functioning of our service. 
              We do not use advertising or third-party tracking cookies. Session data is stored locally in your 
              browser and is not used for cross-site tracking.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">12. Children's Privacy</h2>
            <p className="text-foreground/90 leading-relaxed">
              This service is intended for students of Haaga-Helia University, who are typically 18 years or older. 
              We do not knowingly collect data from individuals under 16 years of age without parental consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">13. Changes to This Policy</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may update this privacy policy from time to time. Any changes will be posted on this page with 
              an updated "Last Updated" date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">14. Contact Information</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              For questions about this privacy policy or to exercise your rights, please contact:
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-foreground/90">
                <strong>Me</strong><br />
                Student at Haaga-Helia University of Applied Sciences<br />
                Email: bhq088@myy.haaga-helia.fi<br />
                Project Repository: <a 
                  href="https://github.com/dragonisdev/Haaga-Helia-voice-assistant" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  GitHub
                </a>
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">15. Supervisory Authority</h2>
            <p className="text-foreground/90 leading-relaxed mb-3">
              You have the right to lodge a complaint with the Finnish Data Protection Authority:
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-foreground/90">
                <strong>Office of the Data Protection Ombudsman</strong><br />
                P.O. Box 800, FI-00531 Helsinki, Finland<br />
                Email: tietosuoja@om.fi<br />
                Website: <a 
                  href="https://tietosuoja.fi/en/home" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  tietosuoja.fi
                </a>
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">16. Open Source Project</h2>
            <p className="text-foreground/90 leading-relaxed">
              This AI voice assistant is an open-source project. You can review the source code, contribute to 
              development, or deploy your own instance at our GitHub repository: <a 
                href="https://github.com/dragonisdev/Haaga-Helia-voice-assistant" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                github.com/dragonisdev/Haaga-Helia-voice-assistant
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground text-center">
            By using the Haaga-Helia AI Voice Assistant, you acknowledge that you have read and understood this privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
