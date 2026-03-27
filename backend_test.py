#!/usr/bin/env python3
"""
Backend API Testing for Smart File Manager
Tests all API endpoints for functionality and data integrity
"""

import requests
import sys
import json
from datetime import datetime

class FileManagerAPITester:
    def __init__(self, base_url="https://swift-files-3.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details="", expected_status=None, actual_status=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name}")
            if expected_status and actual_status:
                print(f"   Expected status: {expected_status}, Got: {actual_status}")
            if details:
                print(f"   Details: {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "expected_status": expected_status,
            "actual_status": actual_status
        })

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test("API Root", success, 
                         f"Message: {data.get('message', 'No message')}", 200, response.status_code)
            return success
        except Exception as e:
            self.log_test("API Root", False, str(e))
            return False

    def test_seed_data(self):
        """Test seeding demo data"""
        try:
            response = requests.post(f"{self.api_url}/seed", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test("Seed Data", success, 
                         f"Files created: {data.get('files', 0)}, Tags: {data.get('tags', 0)}", 
                         200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Seed Data", False, str(e))
            return False, {}

    def test_get_files(self):
        """Test getting files from root directory"""
        try:
            response = requests.get(f"{self.api_url}/files", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test("Get Files (Root)", success, 
                         f"Found {len(data)} items", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Get Files (Root)", False, str(e))
            return False, []

    def test_get_files_with_parent(self, parent_id):
        """Test getting files from specific folder"""
        try:
            response = requests.get(f"{self.api_url}/files?parent_id={parent_id}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test(f"Get Files (Parent: {parent_id})", success, 
                         f"Found {len(data)} items", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Get Files (Parent: {parent_id})", False, str(e))
            return False, []

    def test_get_specific_file(self, file_id):
        """Test getting specific file by ID"""
        try:
            response = requests.get(f"{self.api_url}/files/{file_id}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test(f"Get File ({file_id})", success, 
                         f"File: {data.get('name', 'Unknown')}", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Get File ({file_id})", False, str(e))
            return False, {}

    def test_navigation(self, folder_id=None):
        """Test navigation/breadcrumb endpoint"""
        try:
            endpoint = f"{self.api_url}/navigation/{folder_id or 'root'}"
            response = requests.get(endpoint, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            breadcrumbs = data.get('breadcrumbs', [])
            self.log_test(f"Navigation ({folder_id or 'root'})", success, 
                         f"Breadcrumbs: {len(breadcrumbs)} items", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Navigation ({folder_id or 'root'})", False, str(e))
            return False, {}

    def test_get_tags(self):
        """Test getting all tags"""
        try:
            response = requests.get(f"{self.api_url}/tags", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test("Get Tags", success, 
                         f"Found {len(data)} tags", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Get Tags", False, str(e))
            return False, []

    def test_get_favorites(self):
        """Test getting favorite files"""
        try:
            response = requests.get(f"{self.api_url}/favorites", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test("Get Favorites", success, 
                         f"Found {len(data)} favorites", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Get Favorites", False, str(e))
            return False, []

    def test_get_trash(self):
        """Test getting trashed files"""
        try:
            response = requests.get(f"{self.api_url}/trash", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test("Get Trash", success, 
                         f"Found {len(data)} trashed items", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Get Trash", False, str(e))
            return False, []

    def test_get_stats(self):
        """Test getting file system stats"""
        try:
            response = requests.get(f"{self.api_url}/stats", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test("Get Stats", success, 
                         f"Files: {data.get('total_files', 0)}, Folders: {data.get('total_folders', 0)}", 
                         200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Get Stats", False, str(e))
            return False, {}

    def test_search(self, query="test"):
        """Test search functionality"""
        try:
            response = requests.get(f"{self.api_url}/search?q={query}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else []
            self.log_test(f"Search ('{query}')", success, 
                         f"Found {len(data)} results", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Search ('{query}')", False, str(e))
            return False, []

    def test_create_folder(self):
        """Test creating a new folder"""
        try:
            folder_data = {
                "name": f"Test Folder {datetime.now().strftime('%H%M%S')}",
                "type": "folder",
                "parent_id": None
            }
            response = requests.post(f"{self.api_url}/files", json=folder_data, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test("Create Folder", success, 
                         f"Created: {data.get('name', 'Unknown')}", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test("Create Folder", False, str(e))
            return False, {}

    def test_toggle_favorite(self, file_id):
        """Test toggling favorite status"""
        try:
            response = requests.post(f"{self.api_url}/favorites/{file_id}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test(f"Toggle Favorite ({file_id})", success, 
                         f"Is favorite: {data.get('is_favorite', False)}", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Toggle Favorite ({file_id})", False, str(e))
            return False, {}

    def test_update_file(self, file_id, new_name):
        """Test updating file name"""
        try:
            update_data = {"name": new_name}
            response = requests.patch(f"{self.api_url}/files/{file_id}", json=update_data, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            self.log_test(f"Update File ({file_id})", success, 
                         f"New name: {data.get('name', 'Unknown')}", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Update File ({file_id})", False, str(e))
            return False, {}

    def test_delete_file(self, file_id, permanent=False):
        """Test deleting/trashing a file"""
        try:
            response = requests.delete(f"{self.api_url}/files/{file_id}?permanent={permanent}", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else {}
            action = "Permanently deleted" if permanent else "Moved to trash"
            self.log_test(f"Delete File ({file_id})", success, 
                         f"{action}: {data.get('message', 'No message')}", 200, response.status_code)
            return success, data
        except Exception as e:
            self.log_test(f"Delete File ({file_id})", False, str(e))
            return False, {}

    def run_comprehensive_test(self):
        """Run all tests in sequence"""
        print("🚀 Starting Smart File Manager API Tests")
        print("=" * 50)
        
        # Test basic connectivity
        if not self.test_api_root():
            print("❌ API not accessible, stopping tests")
            return False
        
        # Seed data first
        seed_success, seed_data = self.test_seed_data()
        if not seed_success:
            print("❌ Failed to seed data, some tests may fail")
        
        # Test core file operations
        files_success, files_data = self.test_get_files()
        if files_success and files_data:
            # Test with first folder found
            folders = [f for f in files_data if f.get('type') == 'folder']
            if folders:
                folder_id = folders[0]['id']
                self.test_get_files_with_parent(folder_id)
                self.test_navigation(folder_id)
                self.test_get_specific_file(folder_id)
            
            # Test with first file found
            files_only = [f for f in files_data if f.get('type') != 'folder']
            if files_only:
                file_id = files_only[0]['id']
                self.test_get_specific_file(file_id)
                self.test_toggle_favorite(file_id)
        
        # Test other endpoints
        self.test_navigation()
        self.test_get_tags()
        self.test_get_favorites()
        self.test_get_trash()
        self.test_get_stats()
        self.test_search("image")
        self.test_search("document")
        
        # Test CRUD operations
        create_success, created_folder = self.test_create_folder()
        if create_success and created_folder:
            folder_id = created_folder.get('id')
            if folder_id:
                # Test update
                new_name = f"Updated Folder {datetime.now().strftime('%H%M%S')}"
                self.test_update_file(folder_id, new_name)
                
                # Test delete (move to trash)
                self.test_delete_file(folder_id, permanent=False)
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed - check details above")
            return False

def main():
    """Main test execution"""
    tester = FileManagerAPITester()
    success = tester.run_comprehensive_test()
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "success_rate": (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
        "overall_success": success,
        "test_details": tester.test_results
    }
    
    with open("/app/backend_test_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())