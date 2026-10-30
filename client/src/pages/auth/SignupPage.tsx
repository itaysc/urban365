import { useFormik } from 'formik';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import * as Yup from 'yup';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { AgencyPicker } from '@/components/auth/AgencyPicker';
import { GoogleButton, useGoogleAvailable } from '@/components/auth/GoogleButton';
import { TermsCheckbox } from '@/components/auth/TermsCheckbox';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import type { AgencyLookupResult } from '@/services/auth';

const PASSWORD_MIN = 10;

export function SignupPage() {
  const { user, signup, loading } = useAuth();
  const googleAvailable = useGoogleAvailable();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // Claiming an agency we already scraped, rather than creating an empty one.
  const [claimed, setClaimed] = useState<AgencyLookupResult | null>(null);

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      agencyName: '',
      acceptedTerms: false,
    },
    validationSchema: Yup.object({
      email: Yup.string().email('כתובת אימייל לא תקינה').required('שדה חובה'),
      password: Yup.string()
        .min(PASSWORD_MIN, `לפחות ${PASSWORD_MIN} תווים`)
        .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'צריך אות גדולה, אות קטנה וספרה')
        .required('שדה חובה'),
      firstName: Yup.string().required('שדה חובה'),
      lastName: Yup.string().required('שדה חובה'),
      acceptedTerms: Yup.boolean().oneOf([true], 'יש לאשר את תנאי השימוש ומדיניות הפרטיות'),
    }),
    onSubmit: async (values, helpers) => {
      setFormError(null);
      if (!claimed && !values.agencyName.trim()) {
        setFormError('צריך לבחור סוכנות קיימת או להזין שם סוכנות חדשה.');
        helpers.setSubmitting(false);
        return;
      }

      try {
        await signup({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          acceptedTerms: values.acceptedTerms,
          ...(claimed ? { claimAgencyId: claimed.id } : { agencyName: values.agencyName }),
        });
        navigate('/app/pending', { replace: true });
      } catch (e) {
        setFormError(errorMessageOf(e, 'ההרשמה נכשלה. נסו שוב.'));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <AuthLayout
      title="הרשמה"
      subtitle="פתיחת חשבון לסוכנות נדל״ן"
      footer={<>כבר יש חשבון? <Link to="/agency/login" className="text-blue-700 hover:underline">התחברות</Link></>}
    >
      {/*
        Google first, because for most people it is one click against seven fields. It
        cannot carry an agency name through the redirect, so it lands on /agency/claim,
        where that is all that is asked.

        Disabled until the terms are ticked, for the same reason the submit button is:
        the agreement has to be given before the account exists, and after the redirect
        it is too late to ask.
      */}
      <div className="flex flex-col gap-4">
        <GoogleButton
          returnTo="/agency/claim"
          label="הרשמה עם Google"
          disabled={!formik.values.acceptedTerms}
        />

        {googleAvailable && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">או</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        )}
      </div>

      {!formik.values.acceptedTerms && googleAvailable && (
        <p className="-mt-2 text-xs text-slate-400">
          כדי להמשיך עם Google יש לאשר קודם את תנאי השימוש בתחתית הטופס.
        </p>
      )}

      <form onSubmit={formik.handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם פרטי" htmlFor="firstName" required error={formik.touched.firstName && formik.errors.firstName}>
            <input id="firstName" className={inputClass} {...formik.getFieldProps('firstName')} />
          </Field>
          <Field label="שם משפחה" htmlFor="lastName" required error={formik.touched.lastName && formik.errors.lastName}>
            <input id="lastName" className={inputClass} {...formik.getFieldProps('lastName')} />
          </Field>
        </div>

        <Field label="אימייל" htmlFor="email" required error={formik.touched.email && formik.errors.email}>
          <input id="email" type="email" dir="ltr" autoComplete="email" className={inputClass} {...formik.getFieldProps('email')} />
        </Field>

        <Field label="טלפון" htmlFor="phone">
          <input id="phone" dir="ltr" className={inputClass} {...formik.getFieldProps('phone')} />
        </Field>

        <Field label="סיסמה" htmlFor="password" required error={formik.touched.password && formik.errors.password}>
          <input id="password" type="password" autoComplete="new-password" className={inputClass} {...formik.getFieldProps('password')} />
        </Field>

        <AgencyPicker
          claimed={claimed}
          onClaimedChange={setClaimed}
          agencyName={formik.values.agencyName}
          onAgencyNameChange={(name) => void formik.setFieldValue('agencyName', name)}
        />

        <TermsCheckbox
          id="agency-terms"
          checked={formik.values.acceptedTerms}
          onChange={(checked) => void formik.setFieldValue('acceptedTerms', checked)}
        />

        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <Button type="submit" disabled={formik.isSubmitting || !formik.values.acceptedTerms}>
          {formik.isSubmitting ? 'נרשם…' : 'הרשמה'}
        </Button>
      </form>
    </AuthLayout>
  );
}
