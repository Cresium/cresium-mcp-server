/** Path values that would empty the segment or let fetch normalize the URL away from the signed one. */
export const UNSAFE_PATH_VALUES: ReadonlySet<string> = new Set(["", ".", ".."]);
