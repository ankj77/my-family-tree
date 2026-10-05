import glob
import os
import shutil
import subprocess
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TESTS_DIR)
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node is not on PATH; skipping the browser JS checks")
class TestJsChecks(unittest.TestCase):
    def test_every_node_check_passes(self):
        checks = sorted(glob.glob(os.path.join(TESTS_DIR, "*_check.js")))
        self.assertTrue(checks)
        for path in checks:
            with self.subTest(check=os.path.basename(path)):
                result = subprocess.run([NODE, path], cwd=ROOT, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
