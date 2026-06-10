#!/bin/bash
# Reset FairTatkal between demo takes
echo "Resetting FairTatkal queue..."
curl -s -X POST http://localhost:8000/admin/reset | python3 -m json.tool
echo ""
echo "Done! Queue is clear. Ready for next take."
