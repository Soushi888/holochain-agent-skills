{
  description = "Flake for Holochain app development";

  inputs = {
    # Pin the versioned branch, not `main`. Holonix `main` tracks the current
    # dev line (0.8 as of August 2026), so `main` silently moves you off 0.7.
    # `hc scaffold` 0.700.0 and 0.700.1 emit this same `main-0.7` ref. Only the
    # old 0.700.0-rc.0 (bundled by holonix locked before 2026-10-22) emits
    # `main`; fix it if you scaffolded with that. See references/troubleshooting.md.
    holonix.url = "github:holochain/holonix?ref=main-0.7";

    nixpkgs.follows = "holonix/nixpkgs";
    flake-parts.follows = "holonix/flake-parts";
  };

  outputs = inputs@{ flake-parts, ... }: flake-parts.lib.mkFlake { inherit inputs; } {
    systems = builtins.attrNames inputs.holonix.devShells;
    perSystem = { inputs', pkgs, ... }: {
      formatter = pkgs.nixpkgs-fmt;

      devShells.default = pkgs.mkShell {
        inputsFrom = [ inputs'.holonix.devShells.default ];

        packages = (with pkgs; [
          nodejs_24
          binaryen
          # One of the holochain crate's build dependencies needs perl on PATH.
          # Only required if you build Sweettest suites; harmless otherwise.
          perl
        ]);

        shellHook = ''
          export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
        '';
      };
    };
  };
}
