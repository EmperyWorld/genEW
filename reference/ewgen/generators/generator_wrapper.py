"""
Generator Wrapper
Python wrapper to call TypeScript generators via Node.js
"""

import json
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config_normalizer import (
    get_auxiliary_generators,
    normalize_for_ts_generator,
)
from .ts_worker import USE_TS_WORKER, execute_via_worker
from .types import GeneratedFile, GeneratorConfig, GeneratorResult

# Setup logging
logger = logging.getLogger(__name__)



class GeneratorWrapper:
    """
    Wrapper to execute TypeScript generators from Python
    """

    def __init__(self, project_root: Optional[str] = None):
        # Use provided root or detect from current file location
        if project_root:
            self.project_root = Path(project_root)
        else:
            # Auto-detect project root (go up from generators/ to project root)
            current_file = Path(__file__).resolve()
            self.project_root = current_file.parent.parent

        self.generators_path = (
            self.project_root
            / "src"
            / "services"
            / "generators"
        )

    def _run_module_generation(
        self,
        module_type: str,
        generator_name: str,
        config: GeneratorConfig,
    ) -> GeneratorResult:
        try:
            module_name = config.get("moduleName", "unknown")
            logger.info(
                f"Generating {module_type} module: {module_name}"
            )

            ts_config = normalize_for_ts_generator(config, module_type)
            if USE_TS_WORKER:
                from generators.factory.artifacts import get_run_workspace

                factory_run_id = str(config.get("factoryRunId") or "").strip() or None
                spill_dir = (
                    get_run_workspace(factory_run_id) if factory_run_id else None
                )
                result = execute_via_worker(
                    self.project_root,
                    "module",
                    ts_config,
                    generator_name,
                    run_id=factory_run_id,
                    spill_dir=spill_dir,
                )
            else:
                runner_script = self._create_ts_runner(
                    generator_name, ts_config
                )
                result = self._execute_ts_script(runner_script)
            files = result.get("files", [])

            aux_files = self._run_auxiliary_generators(
                config, module_type, ts_config
            )
            files.extend(aux_files)

            file_count = len(files)
            logger.info(
                f"{module_type} generation successful: "
                f"{file_count} files"
            )
            return {
                "success": True,
                "files": files,
                "stats": self._calculate_stats(files),
                "error": None,
            }
        except Exception as e:
            logger.error(
                f"{module_type} generation failed: {str(e)}",
                exc_info=True,
            )
            return {
                "success": False,
                "files": [],
                "stats": {},
                "error": str(e),
            }

    def _run_auxiliary_generators(
        self,
        config: GeneratorConfig,
        module_type: str,
        ts_config: Dict[str, Any],
    ) -> List[GeneratedFile]:
        aux_generators = get_auxiliary_generators(config)
        if not aux_generators:
            return []

        aux_config = {
            **ts_config,
            "moduleType": module_type,
        }
        try:
            if USE_TS_WORKER:
                result = execute_via_worker(
                    self.project_root,
                    "auxiliary",
                    aux_config,
                )
            else:
                runner = self._create_unified_auxiliary_runner(
                    aux_config
                )
                result = self._execute_ts_script(runner)
            return result.get("files", [])
        except Exception as e:
            logger.warning(f"Auxiliary generators failed: {e}")
            return []

    def _create_unified_auxiliary_runner(
        self, config: Dict[str, Any]
    ) -> str:
        config_json = json.dumps(config, indent=2)
        return f"""
import {{ runAuxiliaryGenerators }} from './src/services/generators/auxiliaryRunner';

const config = {config_json};

try {{
  const files = runAuxiliaryGenerators({{
    name: config.name || config.moduleName,
    moduleName: config.moduleName || config.name,
    moduleType: config.moduleType,
    generation: config.generation,
  }});
  console.log(JSON.stringify({{ files }}, null, 2));
}} catch (error) {{
  console.error('Auxiliary runner error:', error);
  process.exit(1);
}}
"""

    def generate_crud(self, config: GeneratorConfig) -> GeneratorResult:
        """
        Generate CRUD module
        """
        return self._run_module_generation(
            "crud", "crudGenerator", config
        )

    def generate_dashboard(self, config: GeneratorConfig) -> GeneratorResult:
        """
        Generate Dashboard module
        """
        return self._run_module_generation(
            "dashboard", "dashboardGenerator", config
        )

    def generate_kanban(self, config: GeneratorConfig) -> GeneratorResult:
        """
        Generate Kanban module
        """
        return self._run_module_generation(
            "kanban", "kanbanGenerator", config
        )

    def generate_report(self, config: GeneratorConfig) -> GeneratorResult:
        """
        Generate Report module
        """
        return self._run_module_generation(
            "report", "reportGenerator", config
        )

    def generate_chat(self, config: GeneratorConfig) -> GeneratorResult:
        """
        Generate Chat module
        """
        return self._run_module_generation(
            "chat", "chatGenerator", config
        )

    def generate_presentation(
        self, config: GeneratorConfig
    ) -> GeneratorResult:
        """
        Generate Presentation module
        """
        try:
            module_name = config.get("moduleName", "unknown")
            generator = config.get("presentationLibrary", "reveal")
            generator_name = f"{generator}Generator"

            logger.info(
                f"Generating Presentation module: {module_name} "
                f"(library: {generator})"
            )

            ts_config = normalize_for_ts_generator(
                config, "presentation"
            )
            runner_script = self._create_ts_runner(
                generator_name, ts_config
            )
            result = self._execute_ts_script(runner_script)

            file_count = len(result.get("files", []))
            logger.info(
                f"Presentation generation successful: {file_count} files"
            )

            return {
                "success": True,
                "files": result.get("files", []),
                "stats": self._calculate_stats(result.get("files", [])),
                "error": None,
            }

        except Exception as e:
            logger.error(
                f"Presentation generation failed: {str(e)}", exc_info=True
            )
            return {
                "success": False,
                "files": [],
                "stats": {},
                "error": str(e),
            }

    def _create_ts_runner(
        self, generator_name: str, config: Dict[str, Any]
    ) -> str:
        """
        Create TypeScript runner script
        """
        # Convert Python dict to JSON config
        config_json = json.dumps(config, indent=2)

        # Determine generator function name and import style
        generator_map = {
            "crudGenerator": ("generateCRUDModule", "default"),
            "dashboardGenerator": ("generateDashboard", "named"),
            "kanbanGenerator": ("generateKanban", "named"),
            "reportGenerator": ("generateReport", "default"),
            "chatGenerator": ("generateChat", "named"),
            "revealGenerator": ("generateRevealPresentation", "named"),
            "spectacleGenerator": ("generateSpectaclePresentation", "named"),
        }

        generator_info = generator_map.get(generator_name)
        if not generator_info:
            raise ValueError(f"Unknown generator: {generator_name}")

        generator_func, import_style = generator_info

        # Create TypeScript runner with correct import
        if import_style == "default":
            ts_code = f"""
import {generator_func} from './src/services/generators/{generator_name}';

const config = {config_json};

try {{
  const result = {generator_func}(config as any);

  // Normalize result format
  let files;
  if (Array.isArray(result)) {{
    // Result is array of files
    files = result;
  }} else if (result.files) {{
    // Result is object with files property
    files = result.files;
  }} else {{
    throw new Error('Invalid generator result format');
  }}

  // Output as JSON
  console.log(JSON.stringify({{ files }}, null, 2));
}} catch (error) {{
  console.error('Generator error:', error);
  process.exit(1);
}}
"""
        else:  # named import
            ts_code = f"""
import {{ {generator_func} }} from './src/services/generators/{
                generator_name
            }';

const config = {config_json};

try {{
  const result = {generator_func}(config as any);

  // Normalize result format
  let files;
  if (Array.isArray(result)) {{
    // Result is array of files
    files = result;
  }} else if (result.files) {{
    // Result is object with files property
    files = result.files;
  }} else {{
    throw new Error('Invalid generator result format');
  }}

  // Output as JSON
  console.log(JSON.stringify({{ files }}, null, 2));
}} catch (error) {{
  console.error('Generator error:', error);
  process.exit(1);
}}
"""

        return ts_code

    def _execute_ts_script(self, ts_code: str) -> Dict[str, Any]:
        """
        Execute TypeScript code using tsx
        """
        # Create temporary file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".ts", delete=False, dir=str(self.project_root)
        ) as f:
            f.write(ts_code)
            temp_file = f.name

        try:
            # Execute with tsx (TypeScript executor)
            result = subprocess.run(
                ["npx", "tsx", temp_file],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=60,  # Increased timeout for large modules
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"Generator execution failed: {error_msg}")
                raise Exception(f"Generator failed: {error_msg}")

            # Parse JSON output
            output = result.stdout.strip()
            return json.loads(output)

        finally:
            # Clean up temp file
            Path(temp_file).unlink(missing_ok=True)

    def _calculate_stats(self, files: List[GeneratedFile]) -> Dict[str, Any]:
        """
        Calculate statistics from generated files
        """
        if not files:
            return {
                "file_count": 0,
                "total_size": 0,
                "total_lines": 0,
                "languages": [],
            }

        total_size = sum(len(f.get("content", "")) for f in files)
        total_lines = sum(f.get("content", "").count("\n") for f in files)
        languages = list(set(f.get("language", "unknown") for f in files))

        # Group by category if available
        categories = {}
        for f in files:
            category = f.get("category", "other")
            if category not in categories:
                categories[category] = 0
            categories[category] += 1

        return {
            "file_count": len(files),
            "total_size": total_size,
            "total_lines": total_lines,
            "languages": languages,
            "categories": categories,
        }
