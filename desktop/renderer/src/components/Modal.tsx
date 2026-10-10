import { ReactNode, useId } from "react";
import Button from "./Button";
import { useDismiss } from "../hooks/useDismiss";
import styles from "./Modal.module.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// A centred sheet over a dimmed backdrop. Escape or a click on the backdrop
// closes it.
export default function Modal({ title, onClose, children }: Props) {
  const titleId = useId();
  useDismiss(onClose);

  return (
    <div className={styles.overlay} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.bar}>
          <h2 id={titleId}>{title}</h2>
          <Button variant="text" className={styles.close} onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
