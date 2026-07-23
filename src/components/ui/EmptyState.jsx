export function EmptyState({ title, description }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function LoadingState({ title = "불러오는 중입니다.", description = "잠시만 기다려 주세요." }) {
  return <EmptyState title={title} description={description} />;
}
