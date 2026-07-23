export function SectionMeta({ count, helper }) {
  return (
    <div className="sectionMeta">
      <strong>{count}</strong>
      <span>{helper}</span>
    </div>
  );
}
