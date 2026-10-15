"""
Fortune Seaker - Contract Smoke Test Generator
Produces a minimal contract test scaffold for imported modules
"""

import re
from typing import Dict, List, Optional, Tuple

from .asset_pass import is_asset_path
from .ast_analyzer import regex_extract_exports
from .naming import to_kebab
from .path_utils import strip_path_prefix


def resolve_primary_import(
    selected_files: List[Dict[str, str]],
    export_names: List[str],
    module_name: str,
    root_prefix: str,
) -> Tuple[str, str, bool]:
    """
    Resolve primary export name and @imported module path for contract test.
    """
    kebab_name = to_kebab(module_name)
    preferred = ["App", "default"]
    primary_export = next(
        (name for name in preferred if name in export_names),
        export_names[0] if export_names else "default",
    )

    for item in selected_files:
        path = item.get("path", "")
        content = item.get("content", "")
        if not path or is_asset_path(path):
            continue

        exports = regex_extract_exports(content)
        is_default_export = bool(re.search(r"export\s+default\b", content))
        if primary_export not in exports and not (
            primary_export == "default" and "default" in exports
        ):
            if not (is_default_export and primary_export == "App"):
                continue

        stripped = strip_path_prefix(path, root_prefix)
        without_ext = re.sub(r"\.(tsx?|jsx?)$", "", stripped, flags=re.IGNORECASE)
        import_path = f"@imported/{kebab_name}/{without_ext}"
        if is_default_export:
            return "default", import_path, True
        return primary_export, import_path, False

    return primary_export, f"@imported/{kebab_name}", False


def build_contract_smoke_test(
    module_name: str,
    exports: List[str],
    primary_export: Optional[str] = None,
    import_path: Optional[str] = None,
    is_default_export: bool = False,
) -> Dict[str, str]:
    """
    Build Jest/Vitest smoke test with a real import of the primary export.
    """
    kebab_name = to_kebab(module_name)
    export_name = primary_export or (
        "App" if "App" in exports else (exports[0] if exports else "default")
    )
    resolved_import = import_path or f"@imported/{kebab_name}"
    local_name = "ImportedDefault" if is_default_export else export_name

    if is_default_export:
        import_line = f'import {local_name} from "{resolved_import}";'
        expect_target = local_name
    else:
        import_line = f'import {{ {export_name} }} from "{resolved_import}";'
        expect_target = export_name

    export_list = ", ".join(f"'{name}'" for name in exports[:8]) or "'default'"

    content = f"""/**
 * Fortune Seaker contract smoke test
 * cSpell:ignore ewgen
 */
{import_line}

describe('{module_name} import contract', () => {{
  const expectedExports = [{export_list}];

  it('imports primary export', () => {{
    expect({expect_target}).toBeDefined();
  }});

  it('declares expected export names', () => {{
    expect(expectedExports.length).toBeGreaterThan(0);
  }});
}});
"""

    return {
        "path": f"src/imported/{kebab_name}/__tests__/{kebab_name}.contract.test.ts",
        "content": content,
        "language": "typescript",
        "description": "Contract smoke test scaffold for imported module",
    }
