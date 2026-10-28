import { useFormik } from 'formik';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import * as Yup from 'yup';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { errorMessageOf } from '@/lib/apiError';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { lookupAgencies, type AgencyLookupResult } from '@/services/auth';

const PASSWORD_MIN = 10;

export function SignupPage() {
  const { user, signup, loading } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  // Claiming an agency we already scraped, rather than creating an empty one.
  const [agencyQuery, setAgencyQuery] = useState('');
  const [matches, setMatches] = useState<AgencyLookupResult[]>([]);
  const [claimed, setClaimed] = useState<AgencyLookupResult | null>(null);

  useEffect(() => {
    if (claimed || agencyQuery.trim().length < 2) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void lookupAgencies(agencyQuery).then(setMatches).catch(() => setMatches([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [agencyQuery, claimed]);

  const formik = useFormik({
    initialValues: { email: '', password: '', firstName: '', lastName: '', phone: '', agencyName: '' },
    validationSchema: Yup.object({
      email: Yup.string().email('כתובת אימייל לא תקינה').required('שדה חובה'),
      password: Yup.string()
        .min(PASSWORD_MIN, `לפחות ${PASSWORD_MIN} תווים`)
        .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'צריך אות גדולה, אות קטנה וספרה')
        .required('שדה חובה'),
      firstName: Yup.string().required('שדה חובה'),
      lastName: Yup.string().required('שדה חובה'),
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
      footer={<>כבר יש חשבון? <Link to="/login" className="text-blue-700 hover:underline">התחברות</Link></>}
    >
      <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
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

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">הסוכנות</legend>

          {claimed ? (
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium text-slate-900">{claimed.name}</div>
                <div className="text-xs text-slate-500">
                  {claimed.listingCount} נכסים{claimed.city ? ` · ${claimed.city}` : ''}
                </div>
              </div>
              <Button type="button" variant="ghost" onClick={() => { setClaimed(null); setAgencyQuery(''); }}>
                שינוי
              </Button>
            </div>
          ) : (
            <>
              <input
                placeholder="חיפוש סוכנות קיימת ביד2…"
                className={`${inputClass} w-full`}
                value={agencyQuery}
                onChange={(e) => setAgencyQuery(e.target.value)}
              />

              {matches.length > 0 && (
                <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setClaimed(m)}
                        className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-slate-50"
                      >
                        <span>{m.name}</span>
                        <span className="text-xs text-slate-400">{m.listingCount} נכסים</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="my-2 text-center text-xs text-slate-400">או</p>

              <Field label="שם סוכנות חדשה" htmlFor="agencyName">
                <input id="agencyName" className={inputClass} {...formik.getFieldProps('agencyName')} />
              </Field>
            </>
          )}
        </fieldset>

        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}

        <Button type="submit" disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'נרשם…' : 'הרשמה'}
        </Button>
      </form>
    </AuthLayout>
  );
}
