import { Link, useLocation } from "react-router-dom";
import { cx } from "../lib/cx";
import styles from "./Rail.module.css";

const PAGES = [
  { to: "/live", label: "Live" },
  { to: "/saved", label: "Saved" },
  { to: "/sfx", label: "SFX" },
];

// The left-hand page switcher.
export default function Rail() {
  const { pathname } = useLocation();

  return (
    <nav className={styles.rail} aria-label="Pages">
      <p className={styles.brand}>
        <img src="./logo.svg" width="36" height="36" alt="Overtone" />
      </p>
      {PAGES.map((page) => (
        <Link
          key={page.to}
          className={cx(styles.link, pathname === page.to && styles.current)}
          to={page.to}
          aria-current={pathname === page.to ? "page" : undefined}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
