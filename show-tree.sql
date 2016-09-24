
SELECT node.id, CONCAT( REPEAT('  ', COUNT(parent.name) - 1), node.name) AS name
  FROM nested_category AS node,
       nested_category AS parent
 WHERE node.lft BETWEEN parent.lft AND parent.rgt
   AND parent.section_id = node.section_id
 GROUP BY node.section_id, node.name, node.lft, node.id
 ORDER BY node.section_id, node.lft;

