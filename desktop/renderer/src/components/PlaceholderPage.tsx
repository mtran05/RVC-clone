import styles from "./PlaceholderPage.module.css";

interface Props {
  title: string;
}

// A routed page that exists but has nothing to show yet.
export default function PlaceholderPage({ title }: Props) {
  return (
    <section className={styles.page} aria-label={title}>
      <h2>{title}</h2>
      <p>Coming soon.</p>
    </section>
  );
}
