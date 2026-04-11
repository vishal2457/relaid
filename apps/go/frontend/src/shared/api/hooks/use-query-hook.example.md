```ts
// Example 1: Simple query with a parameter
function useUserData(userId: string) {
  return useQuery(() => api.getUser(userId));
}

// Example 2: Multiple parameters
function useProductDetails(productId: string, variant: string) {
  return useQuery(() => api.getProduct(productId, variant));
}

// Example 3: Optional parameters with dependencies
function useSearchResults(searchTerm: string, filters?: SearchFilters) {
  return useQuery(
    () => api.search(searchTerm, filters),
    {
      dependencies: [searchTerm, filters], // Hook will re-fetch when these values change
      enabled: searchTerm.length > 0 // Only run query when search term exists
    }
  );
}

// Usage in components:
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useUserData(userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data?.name}</div>;
}

// use query with search term changes
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // 300ms delay

  const { data, isLoading } = useSearchResults(debouncedSearchTerm, {
    sortBy: 'date',
    limit: 10
  });

  return (
    <div>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search..."
      />

      {isLoading && <div>Searching...</div>}

      {data && (
        <ul>
          {data.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

```
