import { useFormik } from 'formik';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as Yup from 'yup';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { errorMessageOf } from '@/lib/apiError';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { resetPassword } from '@/services/auth';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const token = params.get('token') ?? '';

  const formik = useFormik({
    initialValues: { password: '', confirm: '' },
    validationSchema: Yup.object({
      password: Yup.string()
        .min(10, 'לפחות 10 תווים')
        .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'צריך אות גדולה, אות קטנה וספרה')
        .required('שדה חובה'),
      confirm: Yup.string().oneOf([Yup.ref('password')], 'הסיסמאות אינן תואמות').required('שדה חובה'),
    }),
    onSubmit: async (values, helpers) => {
      setFormError(null);
      try {
        await resetPassword(token, values.password);
        // Every session was revoked by the reset, this browser's included.
        navigate('/login?reset=1', { replace: true });
      } catch (e) {
        setFormError(errorMessageOf(e, 'הקישור אינו תקף או שפג תוקפו.'));
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  if (!token) {
    return (
      <AuthLayout title="איפוס סיסמה">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          חסר קישור איפוס. אפשר לבקש חדש ב<Link to="/forgot-password" className="underline">שכחתי סיסמה</Link>.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="בחירת סיסמה חדשה">
      <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
        <Field label="סיסמה חדשה" htmlFor="password" required error={formik.touched.password && formik.errors.password}>
          <PasswordInput id="password" autoComplete="new-password" {...formik.getFieldProps('password')} />
        </Field>
        <Field label="אימות סיסמה" htmlFor="confirm" required error={formik.touched.confirm && formik.errors.confirm}>
          <PasswordInput id="confirm" autoComplete="new-password" {...formik.getFieldProps('confirm')} />
        </Field>
        {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
        <Button type="submit" disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'שומר…' : 'שמירה'}
        </Button>
      </form>
    </AuthLayout>
  );
}
