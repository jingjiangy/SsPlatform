export default function ApiDocsView() {
  return (
    <iframe
      src="/docs"
      style={{ width: "100%", height: "calc(100vh - 120px)", border: "none", borderRadius: 8 }}
      title="API 文档"
    />
  );
}
