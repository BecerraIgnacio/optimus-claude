#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/ralph" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  --version)
    echo "ralph 0.0.0-test"
    ;;
  --help)
    echo "ralph test stub"
    ;;
  *)
    echo "ralph test stub"
    ;;
esac
EOF

chmod +x "$HOME/.local/bin/ralph"
