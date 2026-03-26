#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/rtk" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  --version)
    echo "rtk 0.0.0-test"
    ;;
  init)
    exit 0
    ;;
  *)
    echo "rtk test stub"
    ;;
esac
EOF

chmod +x "$HOME/.local/bin/rtk"
