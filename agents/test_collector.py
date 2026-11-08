import unittest
from collector import Budget, local_origin, MAX_REQUESTS


class PolicyTests(unittest.TestCase):
    def test_loopback_only(self):
        self.assertEqual(local_origin('http://localhost:3000/'), 'http://localhost:3000')
        for url in ('https://example.com', 'http://localhost.evil.test:3000', 'http://user:password@localhost:3000',
                    'http://localhost:3000/security', 'http://localhost:3000/?key=secret'):
            with self.assertRaises(ValueError):
                local_origin(url)

    def test_scope_and_one_customer_login(self):
        budget = Budget('http://localhost:3000')
        self.assertFalse(budget.permit('http://localhost:3001/api/health', 'GET', 'fetch'))
        self.assertFalse(budget.permit('https://example.com/', 'GET', 'document'))
        self.assertFalse(budget.permit(budget.base+'/security', 'GET', 'document'))
        self.assertFalse(budget.permit(budget.base+'/api/security/demo/reset', 'POST', 'fetch', {}))
        self.assertFalse(budget.permit(budget.base+'/api/demo/session', 'POST', 'fetch', {'handle': 'admin'}))
        self.assertTrue(budget.permit(budget.base+'/api/demo/session', 'POST', 'fetch', {'handle': 'alice'}))
        self.assertFalse(budget.permit(budget.base+'/api/demo/session', 'POST', 'fetch', {'handle': 'alice'}))

    def test_export_and_request_limits(self):
        budget = Budget('http://localhost:3000')
        path = budget.base+'/api/bank/accounts/acc-alice-checking/export'
        for _ in range(6):
            self.assertTrue(budget.permit(path, 'GET', 'fetch'))
        self.assertFalse(budget.permit(path, 'GET', 'fetch'))
        self.assertEqual(budget.exports, 6)
        self.assertEqual(budget.reason, 'export_limit')
        budget = Budget('http://localhost:3000')
        for _ in range(MAX_REQUESTS):
            self.assertTrue(budget.permit(budget.base+'/api/health', 'GET', 'fetch'))
        self.assertFalse(budget.permit(budget.base+'/api/health', 'GET', 'fetch'))
        self.assertEqual(budget.reason, 'request_limit')


if __name__ == '__main__':
    unittest.main()
