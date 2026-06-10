import React from 'react'

export const Privacy: React.FC = () => (
  <div className="privacy-page">
    <h1>Privacy Policy</h1>
    <p className="legal-meta">Effective Date: June 2026 &nbsp;|&nbsp; Version 1.0 (Beta)</p>

    <div className="legal-draft-notice">
      ⚠ DRAFT — This document has not yet been reviewed by a licensed attorney or data privacy
      professional. Have it reviewed before beta launch or public distribution.
    </div>

    <p>
      This Privacy Policy describes how EquityForm ("we", "us", "our") collects, uses, stores, and
      shares information when you use the EquityForm platform ("Platform"). By using the Platform
      you consent to the practices described here.
    </p>

    <h2>1. What We Collect</h2>
    <p>We collect the following categories of information:</p>
    <ul>
      <li>
        <strong>Account &amp; Identity Data:</strong> Name, email address, firm name, and
        authentication credentials (managed via Clerk).
      </li>
      <li>
        <strong>Deal &amp; Entity Data:</strong> Entity names, formation states, property addresses,
        offering details, and deal economics you enter into the Platform.
      </li>
      <li>
        <strong>Investor PII:</strong> Full legal names, mailing addresses, email addresses, phone
        numbers, Tax ID numbers (SSNs/EINs), accreditation status, and subscription amounts.
      </li>
      <li>
        <strong>Financial Data:</strong> Banking information (bank name, account number, routing
        number), wire confirmation numbers, and capital contribution amounts.
      </li>
      <li>
        <strong>Usage Data:</strong> Pages visited, actions taken, timestamps, IP addresses, browser
        type, and device information.
      </li>
      <li>
        <strong>Uploaded Content:</strong> Documents, templates, and files you upload to the Platform.
      </li>
    </ul>

    <h2>2. How We Use Your Data</h2>
    <p>We use collected data to:</p>
    <ul>
      <li>Provide Platform functionality — deal setup, document generation, cap table management.</li>
      <li>Generate legal document templates populated with your deal data.</li>
      <li>Send transactional communications related to your account and deals.</li>
      <li>Diagnose bugs and improve the Platform during beta testing.</li>
      <li>Comply with legal obligations and enforce these Terms.</li>
    </ul>
    <p>
      <strong>We do not sell your personal data to third parties.</strong> We do not use your data
      for advertising or share it with data brokers.
    </p>

    <h2>3. Third-Party Services</h2>
    <p>The Platform integrates with the following third-party services:</p>
    <ul>
      <li>
        <strong>Clerk</strong> — Authentication and identity management. Clerk processes your
        login credentials under their own privacy policy.
      </li>
      <li>
        <strong>DocuSign</strong> — Electronic signature collection. Signed documents and signatory
        data are processed under DocuSign's privacy policy.
      </li>
      <li>
        <strong>Google Maps / Places API</strong> — Address autocomplete. Address queries are sent
        to Google under their privacy policy.
      </li>
      <li>
        <strong>Hosting Provider</strong> — Infrastructure and database hosting. Data is stored on
        servers located in the United States.
      </li>
    </ul>

    <h2>4. Data Security</h2>
    <p>We implement the following security measures:</p>
    <ul>
      <li>All data transmitted between your browser and our servers uses TLS encryption.</li>
      <li>Access to deal and investor data is scoped to authenticated firm members only.</li>
      <li>Sensitive fields (tax IDs, account numbers) are treated as confidential within the system.</li>
      <li>Deleted records use soft deletion and are not immediately purged from backups.</li>
    </ul>
    <p>
      No system is perfectly secure. We cannot guarantee absolute security. If you believe a
      security incident has occurred, contact{' '}
      <a href="mailto:support@equityform.com" className="accept-modal-link">support@equityform.com</a>{' '}
      immediately.
    </p>

    <h2>5. Data Retention</h2>
    <p>
      We retain your data while your account is active. Following account deletion, data is retained
      for up to 12 months to comply with legal and regulatory obligations, after which it is
      permanently deleted from primary systems. Backup copies may persist for up to 90 additional
      days following backup rotation.
    </p>

    <h2>6. Your Rights (CCPA / GDPR)</h2>
    <p>Depending on your jurisdiction, you may have the following rights:</p>
    <ul>
      <li>
        <strong>Access:</strong> Request a copy of the personal data we hold about you.
      </li>
      <li>
        <strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention
        obligations).
      </li>
      <li>
        <strong>Portability:</strong> Receive your data in a machine-readable format.
      </li>
      <li>
        <strong>Correction:</strong> Request correction of inaccurate personal data.
      </li>
      <li>
        <strong>Opt-Out:</strong> California residents may opt out of certain data sharing under the
        CCPA. Contact us to exercise this right.
      </li>
    </ul>
    <p>
      To exercise any of these rights, contact us at{' '}
      <a href="mailto:support@equityform.com" className="accept-modal-link">support@equityform.com</a>.
      We will respond within 30 days.
    </p>

    <h2>7. EU / UK Residents</h2>
    <p>
      If you are located in the European Union or United Kingdom, you have additional rights under
      the GDPR / UK GDPR. Our Data Protection Officer can be contacted at{' '}
      <a href="mailto:support@equityform.com" className="accept-modal-link">support@equityform.com</a>.
      You have the right to lodge a complaint with your local supervisory authority.
    </p>

    <h2>8. Children's Privacy</h2>
    <p>
      The Platform is not directed to persons under the age of 18. We do not knowingly collect
      personal information from minors. If you believe a minor has provided us data, contact us
      to request deletion.
    </p>

    <h2>9. Beta Data Warning</h2>
    <p>
      <strong>During the beta period, data may be deleted, reset, or migrated without notice.</strong>{' '}
      Do not store any irreplaceable data solely on the EquityForm Platform. Maintain your own
      backup copies of all important documents and investor records.
    </p>

    <h2>10. Changes to This Policy</h2>
    <p>
      We may update this Privacy Policy from time to time. Changes will be posted on this page with
      an updated effective date. Continued use of the Platform after changes constitutes acceptance
      of the updated Policy.
    </p>

    <h2>11. Contact Us</h2>
    <p>
      For privacy-related questions or data requests, contact:{' '}
      <a href="mailto:support@equityform.com" className="accept-modal-link">support@equityform.com</a>
    </p>

    <p style={{ marginTop: 40, fontSize: 12, color: 'var(--color-slate-400)' }}>
      © {new Date().getFullYear()} EquityForm. All rights reserved.
    </p>
  </div>
)
