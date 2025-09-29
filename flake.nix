{
  description = "Dev environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            corepack_22
            pkgs.zsh
          ];

          # Automatically install node packages in the shell
          shellHook = ''
            export SHELL=${pkgs.zsh}/bin/zsh
            exec $SHELL

            if [ -f pnpm-lock.yaml ]; then
              pnpm install
            fi
          '';
        };
      }
    );
}
