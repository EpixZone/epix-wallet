import { useEffect, useRef } from "react";
import { focusForKeyboard } from "../utils/focus";

export const useFocusOnMount = <Ref extends HTMLElement>() => {
  const ref = useRef<Ref>(null);
  useEffect(() => {
    focusForKeyboard(ref.current);
  }, []);
  return ref;
};
