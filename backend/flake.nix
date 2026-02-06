{
  description = "budget backend (FastAPI) dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
    py = pkgs.python3;
  in {
    devShells.${system}.default = pkgs.mkShell {
      packages = [
        py
        pkgs.uv              # fast venv + installs (optional but recommended)
        pkgs.ruff
        pkgs.pyright
        pkgs.git

        # native build toolchain (covers common wheels that need compiling)
        pkgs.pkg-config
        pkgs.gcc

        # common native libs frequently needed by Python deps
        pkgs.openssl
        pkgs.zlib
        pkgs.libffi
        pkgs.sqlite

        # sometimes needed (e.g., watchfiles / rust-based extensions)
        pkgs.rustc
        pkgs.cargo
      ];

      # Keep venv local and predictable
      shellHook = ''
        export VENV_DIR=".venv"
        export PIP_DISABLE_PIP_VERSION_CHECK=1
        export UV_LINK_MODE=copy

        if [ ! -d "$VENV_DIR" ]; then
          ${pkgs.uv}/bin/uv venv "$VENV_DIR"
        fi
        source "$VENV_DIR/bin/activate"

        echo "Python: $(python --version)"
      '';
    };
  };
}
