/** The fields of the account form that the profile update sends. */
export interface ProfileFields {
  username: string;
  email: string;
  image: string;
  birthday: string;
  phone: string;
}

/**
 * The PUT /profile body for the account form. The phone is left out unless it changed: the server keeps a phone it
 * isn't sent, so a form that fell back to an empty phone (the profile failed to load) can't wipe the stored one.
 */
export function profileUpdateBody(form: ProfileFields, original: ProfileFields): ProfileFields | Omit<ProfileFields, 'phone'> {
  if (form.phone === original.phone) {
    return { username: form.username, email: form.email, image: form.image, birthday: form.birthday };
  }
  return form;
}
