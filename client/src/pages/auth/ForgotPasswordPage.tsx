import { useFormik } from 'formik';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as Yup from 'yup';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { forgotPassword } from '@/services/auth';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const formik = useFormik({
    initialValues: { email: '' },
    validationSchema: Yup.object({ email: Yup.string().email('כתובת אימייל לא תקינה').required('שדה חובה') }),
    onSubmit: async (values, helpers) => {
      // The server answers identically whether or not the address exists, so the UI has
      // to as well — otherwise the neutral response is undone by the screen.
      await forgotPassword(values.email).catch(() => undefined);
      setSent(true);
      helpers.setSubmitting(false);
    },
  });

  return (
    <AuthLayout
      title="איפוס סיסמה"
      footer={<Link to="/login" className="text-blue-700 hover:underline">חזרה להתחברות</Link>}
    >
      {sent ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          אם קיים חשבון עם הכתובת הזו, נשלח אליה קישור לאיפוס הסיסמה.
        </p>
      ) : (
        <form onSubmit={formik.handleSubmit} className="flex flex-col gap-4">
          <Field label="אימייל" htmlFor="email" required error={formik.touched.email && formik.errors.email}>
            <input id="email" type="email" dir="ltr" className={inputClass} {...formik.getFieldProps('email')} />
          </Field>
          <Button type="submit" disabled={formik.isSubmitting}>
            {formik.isSubmitting ? 'שולח…' : 'שליחת קישור'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
